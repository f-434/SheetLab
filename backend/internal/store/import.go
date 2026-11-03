package store

import (
	"database/sql"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"sheetlab/backend/internal/xlsx"
)

var integerPattern = regexp.MustCompile(`^-?(0|[1-9][0-9]{0,14})$`)

// ImportWorkbook creates one SQLite table per worksheet inside a single transaction.
func (s *Store) ImportWorkbook(sourceFile string, sheets []xlsx.Sheet) ([]*Dataset, error) {
	tx, err := s.rw.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	created := make([]*Dataset, 0, len(sheets))
	for _, sheet := range sheets {
		ds, err := importSheet(tx, sourceFile, sheet)
		if err != nil {
			return nil, err
		}
		if ds != nil {
			created = append(created, ds)
		}
	}
	if len(created) == 0 {
		return nil, fmt.Errorf("Excel 中没有可导入的数据（需要表头和至少一行数据）")
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return created, nil
}

func importSheet(tx *sql.Tx, sourceFile string, sheet xlsx.Sheet) (*Dataset, error) {
	headerIndex := -1
	for i, row := range sheet.Rows {
		if !allEmpty(row) {
			headerIndex = i
			break
		}
	}
	if headerIndex < 0 {
		return nil, nil
	}

	header := append([]string(nil), sheet.Rows[headerIndex]...)
	dataRows := make([][]string, 0, len(sheet.Rows)-headerIndex-1)
	for _, row := range sheet.Rows[headerIndex+1:] {
		if !allEmpty(row) {
			dataRows = append(dataRows, row)
		}
	}
	if len(dataRows) == 0 {
		return nil, nil
	}

	width := len(header)
	for _, row := range dataRows {
		if len(row) > width {
			width = len(row)
		}
	}
	for len(header) < width {
		header = append(header, "")
	}
	if width == 0 {
		return nil, nil
	}

	names := makeColumnNames(header)
	types := make([]string, width)
	for i := 0; i < width; i++ {
		values := make([]string, len(dataRows))
		for j, row := range dataRows {
			if i < len(row) {
				values[j] = row[i]
			}
		}
		types[i] = inferType(values)
	}

	tableName, err := uniqueTableName(tx, sheet.Name)
	if err != nil {
		return nil, err
	}

	defs := make([]string, width)
	for i := range names {
		defs[i] = QuoteIdent(names[i]) + " " + types[i]
	}
	if _, err := tx.Exec("CREATE TABLE " + QuoteIdent(tableName) + " (" + strings.Join(defs, ", ") + ")"); err != nil {
		return nil, fmt.Errorf("创建工作表「%s」失败: %w", sheet.Name, err)
	}

	quotedCols := make([]string, width)
	placeholders := make([]string, width)
	for i := range names {
		quotedCols[i] = QuoteIdent(names[i])
		placeholders[i] = "?"
	}
	stmt, err := tx.Prepare("INSERT INTO " + QuoteIdent(tableName) + " (" +
		strings.Join(quotedCols, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ")")
	if err != nil {
		return nil, err
	}
	defer stmt.Close()

	for _, row := range dataRows {
		args := make([]any, width)
		for i := 0; i < width; i++ {
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			args[i] = convertCell(cell, types[i])
		}
		if _, err := stmt.Exec(args...); err != nil {
			return nil, fmt.Errorf("写入工作表「%s」数据失败: %w", sheet.Name, err)
		}
	}

	displayName := strings.TrimSpace(sheet.Name)
	if displayName == "" {
		displayName = "Sheet"
	}
	createdAt := time.Now().Format(time.RFC3339)
	res, err := tx.Exec(`INSERT INTO _datasets
		(table_name, display_name, source_file, sheet_name, row_count, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		tableName, displayName, sourceFile, sheet.Name, len(dataRows), createdAt)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	cols := make([]Column, width)
	for i := range names {
		cols[i] = Column{Name: names[i], Type: types[i]}
	}
	return &Dataset{
		ID:          id,
		TableName:   tableName,
		DisplayName: displayName,
		SourceFile:  sourceFile,
		SheetName:   sheet.Name,
		RowCount:    int64(len(dataRows)),
		CreatedAt:   createdAt,
		Columns:     cols,
	}, nil
}

func allEmpty(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

func makeColumnNames(header []string) []string {
	names := make([]string, len(header))
	used := make(map[string]bool, len(header))
	for i, raw := range header {
		base := cleanHeaderName(raw, i)
		name := base
		for n := 2; used[strings.ToLower(name)]; n++ {
			name = fmt.Sprintf("%s_%d", base, n)
		}
		used[strings.ToLower(name)] = true
		names[i] = name
	}
	return names
}

func cleanHeaderName(raw string, index int) string {
	name := strings.ReplaceAll(raw, "\r", " ")
	name = strings.ReplaceAll(name, "\n", " ")
	name = strings.TrimSpace(name)
	if name == "" {
		name = fmt.Sprintf("列%d", index+1)
	}
	runes := []rune(name)
	if len(runes) > 80 {
		name = string(runes[:80])
	}
	switch strings.ToLower(name) {
	case "rowid", "_rowid_", "oid", "_id":
		name = name + "_col"
	}
	return name
}

func inferType(values []string) string {
	hasValue := false
	allInt := true
	allReal := true
	for _, raw := range values {
		v := strings.TrimSpace(raw)
		if v == "" {
			continue
		}
		hasValue = true
		if !integerPattern.MatchString(v) {
			allInt = false
		}
		if !isReal(v) {
			allReal = false
		}
	}
	switch {
	case !hasValue:
		return "TEXT"
	case allInt:
		return "INTEGER"
	case allReal:
		return "REAL"
	default:
		return "TEXT"
	}
}

func isReal(v string) bool {
	if !strings.Contains(v, ".") {
		return false
	}
	if _, err := strconv.ParseFloat(v, 64); err != nil {
		return false
	}
	return true
}

func convertCell(raw string, typ string) any {
	v := strings.TrimSpace(raw)
	if v == "" {
		return nil
	}
	switch typ {
	case "INTEGER":
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	case "REAL":
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return v
}

func uniqueTableName(tx *sql.Tx, sheetName string) (string, error) {
	base := sanitizeTableName(sheetName)
	for n := 1; ; n++ {
		candidate := base
		if n > 1 {
			candidate = fmt.Sprintf("%s_%d", base, n)
		}
		var count int
		err := tx.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(?)`, candidate).Scan(&count)
		if err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
	}
}

func sanitizeTableName(name string) string {
	name = strings.TrimSpace(name)
	var b strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		out = "sheet"
	}
	runes := []rune(out)
	if len(runes) > 40 {
		out = string(runes[:40])
	}
	lower := strings.ToLower(out)
	if strings.HasPrefix(lower, "sqlite_") || lower == "_datasets" {
		out = "t_" + out
	}
	return out
}
