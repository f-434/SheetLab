// Package api exposes the SheetLab HTTP API and serves the built frontend.
package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"sheetlab/backend/internal/store"
	"sheetlab/backend/internal/xlsx"
)

const maxUploadBytes = 100 << 20

type handler struct {
	store *store.Store
}

// NewRouter builds the Gin engine with API routes and optional static hosting.
func NewRouter(st *store.Store, staticDir string) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), corsMiddleware())
	r.MaxMultipartMemory = 64 << 20

	h := &handler{store: st}

	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	{
		api.GET("/datasets", h.listDatasets)
		api.POST("/datasets/import", h.importWorkbook)
		api.GET("/datasets/:id", h.getDataset)
		api.PATCH("/datasets/:id", h.renameDataset)
		api.DELETE("/datasets/:id", h.deleteDataset)

		api.GET("/datasets/:id/rows", h.listRows)
		api.POST("/datasets/:id/rows", h.createRow)
		api.PUT("/datasets/:id/rows/:rowid", h.updateRow)
		api.DELETE("/datasets/:id/rows/:rowid", h.deleteRow)

		api.POST("/query", h.runQuery)
		api.POST("/query/export", h.exportQuery)
	}

	mountStatic(r, staticDir)
	return r
}

func (h *handler) listDatasets(c *gin.Context) {
	datasets, err := h.store.ListDatasets()
	if err != nil {
		fail(c, http.StatusInternalServerError, "读取数据表失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"datasets": datasets})
}

func (h *handler) getDataset(c *gin.Context) {
	ds, ok := h.loadDataset(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{"dataset": ds})
}

func (h *handler) importWorkbook(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		fail(c, http.StatusBadRequest, "请选择要导入的 Excel 文件")
		return
	}
	if fileHeader.Size > maxUploadBytes {
		fail(c, http.StatusBadRequest, "文件过大，最大支持 100MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if ext != ".xlsx" && ext != ".xlsm" {
		fail(c, http.StatusBadRequest, "仅支持 .xlsx / .xlsm 格式")
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		fail(c, http.StatusBadRequest, "无法读取上传文件")
		return
	}
	defer file.Close()

	sheets, err := xlsx.Read(file)
	if err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	datasets, err := h.store.ImportWorkbook(filepath.Base(fileHeader.Filename), sheets)
	if err != nil {
		fail(c, http.StatusBadRequest, "导入失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"datasets": datasets})
}

func (h *handler) renameDataset(c *gin.Context) {
	ds, ok := h.loadDataset(c)
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求数据格式不正确")
		return
	}
	updated, err := h.store.RenameDataset(ds, body.Name)
	if err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"dataset": updated})
}

func (h *handler) deleteDataset(c *gin.Context) {
	ds, ok := h.loadDataset(c)
	if !ok {
		return
	}
	if err := h.store.DeleteDataset(ds); err != nil {
		fail(c, http.StatusInternalServerError, "删除数据表失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *handler) listRows(c *gin.Context) {
	ds, ok := h.loadDataset(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	result, err := h.store.FetchRows(ds, page, pageSize, c.Query("search"), c.Query("sortBy"), c.Query("sortOrder"))
	if err != nil {
		fail(c, http.StatusInternalServerError, "读取数据失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *handler) createRow(c *gin.Context) {
	ds, ok := h.loadDataset(c)
	if !ok {
		return
	}
	var body struct {
		Values map[string]any `json:"values"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求数据格式不正确")
		return
	}
	id, err := h.store.CreateRow(ds, body.Values)
	if err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "rowCount": ds.RowCount})
}

func (h *handler) updateRow(c *gin.Context) {
	ds, ok := h.loadDataset(c)
	if !ok {
		return
	}
	rowID, err := strconv.ParseInt(c.Param("rowid"), 10, 64)
	if err != nil {
		fail(c, http.StatusBadRequest, "行标识不正确")
		return
	}
	var body struct {
		Values map[string]any `json:"values"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求数据格式不正确")
		return
	}
	if err := h.store.UpdateRow(ds, rowID, body.Values); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			fail(c, http.StatusNotFound, "该行不存在或已被删除")
			return
		}
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *handler) deleteRow(c *gin.Context) {
	ds, ok := h.loadDataset(c)
	if !ok {
		return
	}
	rowID, err := strconv.ParseInt(c.Param("rowid"), 10, 64)
	if err != nil {
		fail(c, http.StatusBadRequest, "行标识不正确")
		return
	}
	if err := h.store.DeleteRow(ds, rowID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			fail(c, http.StatusNotFound, "该行不存在或已被删除")
			return
		}
		fail(c, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "rowCount": ds.RowCount})
}

func (h *handler) runQuery(c *gin.Context) {
	var body struct {
		SQL   string `json:"sql"`
		Limit int    `json:"limit"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求数据格式不正确")
		return
	}
	if err := validateSQL(body.SQL); err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	limit := body.Limit
	if limit <= 0 {
		limit = 2000
	}
	if limit > 20000 {
		limit = 20000
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	result, err := h.store.RunQuery(ctx, strings.TrimSpace(body.SQL), limit)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			fail(c, http.StatusGatewayTimeout, "查询超时，请缩小查询范围后重试")
			return
		}
		fail(c, http.StatusBadRequest, "SQL 执行失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *handler) exportQuery(c *gin.Context) {
	var body struct {
		SQL string `json:"sql"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求数据格式不正确")
		return
	}
	if err := validateSQL(body.SQL); err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	data, err := h.store.ExportQueryXLSX(ctx, strings.TrimSpace(body.SQL))
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			fail(c, http.StatusGatewayTimeout, "导出超时，请缩小查询范围后重试")
			return
		}
		fail(c, http.StatusBadRequest, "导出失败: "+err.Error())
		return
	}

	filename := "query_" + time.Now().Format("20060102_150405") + ".xlsx"
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
}

func (h *handler) loadDataset(c *gin.Context) (*store.Dataset, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		fail(c, http.StatusBadRequest, "数据表标识不正确")
		return nil, false
	}
	ds, err := h.store.DatasetByID(id)
	if errors.Is(err, store.ErrNotFound) {
		fail(c, http.StatusNotFound, "数据表不存在")
		return nil, false
	}
	if err != nil {
		fail(c, http.StatusInternalServerError, "读取数据表失败: "+err.Error())
		return nil, false
	}
	return ds, true
}

func fail(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, gin.H{"error": message})
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if origin := c.GetHeader("Origin"); origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Header("Access-Control-Expose-Headers", "Content-Disposition")
			c.Header("Vary", "Origin")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func mountStatic(r *gin.Engine, dir string) {
	if dir == "" {
		return
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return
	}
	info, err := os.Stat(abs)
	if err != nil || !info.IsDir() {
		return
	}
	index := filepath.Join(abs, "index.html")

	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			fail(c, http.StatusNotFound, "接口不存在")
			return
		}
		rel := strings.TrimPrefix(path.Clean("/"+c.Request.URL.Path), "/")
		if rel != "" && rel != "." {
			target := filepath.Join(abs, filepath.FromSlash(rel))
			if info, err := os.Stat(target); err == nil && !info.IsDir() {
				c.File(target)
				return
			}
		}
		if _, err := os.Stat(index); err == nil {
			c.File(index)
			return
		}
		fail(c, http.StatusNotFound, "页面不存在")
	})
}
