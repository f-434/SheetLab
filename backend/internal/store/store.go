package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	_ "modernc.org/sqlite"
)

// ErrNotFound is returned when a dataset does not exist.
var ErrNotFound = errors.New("数据表不存在")

// Store owns the writable and read-only SQLite handles.
type Store struct {
	rw *sql.DB
	ro *sql.DB
}

// Open creates (if needed) the SQLite database and prepares both handles.
func Open(path string) (*Store, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("解析数据库路径失败: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return nil, fmt.Errorf("创建数据库目录失败: %w", err)
	}

	uri := sqliteURI(abs)
	rw, err := sql.Open("sqlite", uri+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	// A single writer keeps SQLite locking predictable.
	rw.SetMaxOpenConns(1)
	rw.SetMaxIdleConns(1)

	ro, err := sql.Open("sqlite", uri+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		rw.Close()
		return nil, fmt.Errorf("打开只读数据库失败: %w", err)
	}
	ro.SetMaxOpenConns(4)
	ro.SetMaxIdleConns(4)

	s := &Store{rw: rw, ro: ro}
	if err := s.init(); err != nil {
		rw.Close()
		ro.Close()
		return nil, err
	}
	return s, nil
}

// sqliteURI turns an absolute OS path into a valid SQLite file URI.
func sqliteURI(abs string) string {
	p := filepath.ToSlash(abs)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return "file://" + p
}

func (s *Store) init() error {
	const schema = `CREATE TABLE IF NOT EXISTS _datasets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		table_name TEXT NOT NULL UNIQUE,
		display_name TEXT NOT NULL,
		source_file TEXT NOT NULL DEFAULT '',
		sheet_name TEXT NOT NULL DEFAULT '',
		row_count INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL
	)`
	if _, err := s.rw.Exec(schema); err != nil {
		return fmt.Errorf("初始化数据库失败: %w", err)
	}
	return nil
}

// Close releases the database handles.
func (s *Store) Close() error {
	roErr := s.ro.Close()
	rwErr := s.rw.Close()
	return errors.Join(roErr, rwErr)
}

// QuoteIdent safely quotes a SQLite identifier.
func QuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func (s *Store) columnsFor(table string) ([]Column, error) {
	rows, err := s.rw.Query("PRAGMA table_info(" + QuoteIdent(table) + ")")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols := make([]Column, 0, 8)
	for rows.Next() {
		var (
			cid       int
			name      string
			ctype     string
			notNull   int
			dfltValue sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dfltValue, &pk); err != nil {
			return nil, err
		}
		if ctype == "" {
			ctype = "TEXT"
		}
		cols = append(cols, Column{Name: name, Type: strings.ToUpper(ctype)})
	}
	return cols, rows.Err()
}

// ListDatasets returns all imported datasets, newest first.
func (s *Store) ListDatasets() ([]*Dataset, error) {
	rows, err := s.rw.Query(`SELECT id, table_name, display_name, source_file, sheet_name, row_count, created_at
		FROM _datasets ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	datasets := make([]*Dataset, 0)
	for rows.Next() {
		ds := &Dataset{}
		if err := rows.Scan(&ds.ID, &ds.TableName, &ds.DisplayName, &ds.SourceFile, &ds.SheetName, &ds.RowCount, &ds.CreatedAt); err != nil {
			return nil, err
		}
		datasets = append(datasets, ds)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, ds := range datasets {
		cols, err := s.columnsFor(ds.TableName)
		if err != nil {
			return nil, err
		}
		ds.Columns = cols
	}
	return datasets, nil
}

// DatasetByID loads one dataset with its columns.
func (s *Store) DatasetByID(id int64) (*Dataset, error) {
	ds := &Dataset{}
	err := s.rw.QueryRow(`SELECT id, table_name, display_name, source_file, sheet_name, row_count, created_at
		FROM _datasets WHERE id = ?`, id).
		Scan(&ds.ID, &ds.TableName, &ds.DisplayName, &ds.SourceFile, &ds.SheetName, &ds.RowCount, &ds.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	cols, err := s.columnsFor(ds.TableName)
	if err != nil {
		return nil, err
	}
	ds.Columns = cols
	return ds, nil
}

// RenameDataset renames the SQLite table and its display name.
func (s *Store) RenameDataset(ds *Dataset, rawName string) (*Dataset, error) {
	name, err := validateTableName(rawName)
	if err != nil {
		return nil, err
	}
	if name == ds.TableName {
		return ds, nil
	}

	var count int
	err = s.rw.QueryRow(`SELECT COUNT(*) FROM sqlite_master
		WHERE type = 'table' AND lower(name) = lower(?) AND name <> ?`, name, ds.TableName).Scan(&count)
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, fmt.Errorf("表名「%s」已存在", name)
	}

	tx, err := s.rw.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("ALTER TABLE " + QuoteIdent(ds.TableName) + " RENAME TO " + QuoteIdent(name)); err != nil {
		return nil, fmt.Errorf("重命名数据表失败: %w", err)
	}
	if _, err := tx.Exec("UPDATE _datasets SET table_name = ?, display_name = ? WHERE id = ?", name, name, ds.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	ds.TableName = name
	ds.DisplayName = name
	return ds, nil
}

func validateTableName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", errors.New("表名不能为空")
	}
	runes := []rune(name)
	if len(runes) > 40 {
		return "", errors.New("表名最长 40 个字符")
	}
	for _, r := range runes {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' {
			return "", errors.New("表名仅支持中文、字母、数字和下划线")
		}
	}
	lower := strings.ToLower(name)
	if strings.HasPrefix(lower, "sqlite_") || lower == "_datasets" {
		return "", errors.New("该表名为系统保留名称")
	}
	return name, nil
}

// DeleteDataset drops the physical table and its metadata.
func (s *Store) DeleteDataset(ds *Dataset) error {
	tx, err := s.rw.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DROP TABLE IF EXISTS " + QuoteIdent(ds.TableName)); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM _datasets WHERE id = ?", ds.ID); err != nil {
		return err
	}
	return tx.Commit()
}
