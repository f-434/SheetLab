package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// FetchRows returns one page of dataset rows, optionally filtered and sorted.
func (s *Store) FetchRows(ds *Dataset, page, pageSize int, search, sortBy, sortOrder string) (*RowPage, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}

	names := make([]string, len(ds.Columns))
	for i, col := range ds.Columns {
		names[i] = col.Name
	}

	var where string
	args := make([]any, 0, len(names))
	if term := strings.TrimSpace(search); term != "" {
		pattern := "%" + escapeLike(term) + "%"
		clauses := make([]string, 0, len(names))
		for _, name := range names {
			clauses = append(clauses, "CAST("+QuoteIdent(name)+" AS TEXT) LIKE ? ESCAPE '\\'")
			args = append(args, pattern)
		}
		where = " WHERE " + strings.Join(clauses, " OR ")
	}

	var total int64
	if err := s.ro.QueryRow("SELECT COUNT(*) FROM "+QuoteIdent(ds.TableName)+where, args...).Scan(&total); err != nil {
		return nil, err
	}

	orderBy := " ORDER BY rowid ASC"
	if sorted := findColumn(names, sortBy); sorted != "" {
		direction := "ASC"
		if strings.EqualFold(sortOrder, "desc") {
			direction = "DESC"
		}
		orderBy = " ORDER BY " + QuoteIdent(sorted) + " COLLATE NOCASE " + direction
	}

	selectCols := make([]string, 0, len(names)+1)
	selectCols = append(selectCols, "rowid AS _id")
	for _, name := range names {
		selectCols = append(selectCols, QuoteIdent(name))
	}
	query := "SELECT " + strings.Join(selectCols, ", ") +
		" FROM " + QuoteIdent(ds.TableName) + where + orderBy + " LIMIT ? OFFSET ?"
	queryArgs := make([]any, 0, len(args)+2)
	queryArgs = append(queryArgs, args...)
	queryArgs = append(queryArgs, pageSize, (page-1)*pageSize)

	rows, err := s.ro.Query(query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pageRows := make([]map[string]any, 0)
	for rows.Next() {
		values, err := scanValues(rows, len(names)+1)
		if err != nil {
			return nil, err
		}
		item := make(map[string]any, len(names)+1)
		item["_id"] = values[0]
		for i, name := range names {
			item[name] = values[i+1]
		}
		pageRows = append(pageRows, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &RowPage{
		Columns:  ds.Columns,
		Rows:     pageRows,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func findColumn(names []string, target string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return ""
	}
	for _, name := range names {
		if name == target {
			return name
		}
	}
	for _, name := range names {
		if strings.EqualFold(name, target) {
			return name
		}
	}
	return ""
}

// CreateRow inserts a row using the given column values.
func (s *Store) CreateRow(ds *Dataset, values map[string]any) (int64, error) {
	names := make([]string, 0, len(values))
	args := make([]any, 0, len(values))
	for key, value := range values {
		column, ok := lookupColumn(ds.Columns, key)
		if !ok {
			return 0, fmt.Errorf("未知字段「%s」", key)
		}
		normalized, err := normalizeInput(value, column)
		if err != nil {
			return 0, err
		}
		names = append(names, QuoteIdent(column.Name))
		args = append(args, normalized)
	}

	var query string
	if len(names) == 0 {
		query = "INSERT INTO " + QuoteIdent(ds.TableName) + " DEFAULT VALUES"
	} else {
		placeholders := make([]string, len(names))
		for i := range placeholders {
			placeholders[i] = "?"
		}
		query = "INSERT INTO " + QuoteIdent(ds.TableName) + " (" +
			strings.Join(names, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ")"
	}

	res, err := s.rw.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := s.refreshRowCount(ds); err != nil {
		return 0, err
	}
	return id, nil
}

// UpdateRow updates one row identified by its SQLite rowid.
func (s *Store) UpdateRow(ds *Dataset, rowID int64, values map[string]any) error {
	if len(values) == 0 {
		return errors.New("没有需要更新的字段")
	}

	sets := make([]string, 0, len(values))
	args := make([]any, 0, len(values)+1)
	for key, value := range values {
		column, ok := lookupColumn(ds.Columns, key)
		if !ok {
			return fmt.Errorf("未知字段「%s」", key)
		}
		normalized, err := normalizeInput(value, column)
		if err != nil {
			return err
		}
		sets = append(sets, QuoteIdent(column.Name)+" = ?")
		args = append(args, normalized)
	}
	args = append(args, rowID)

	res, err := s.rw.Exec("UPDATE "+QuoteIdent(ds.TableName)+" SET "+strings.Join(sets, ", ")+" WHERE rowid = ?", args...)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// DeleteRow removes one row identified by its SQLite rowid.
func (s *Store) DeleteRow(ds *Dataset, rowID int64) error {
	res, err := s.rw.Exec("DELETE FROM "+QuoteIdent(ds.TableName)+" WHERE rowid = ?", rowID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return s.refreshRowCount(ds)
}

func (s *Store) refreshRowCount(ds *Dataset) error {
	var count int64
	if err := s.rw.QueryRow("SELECT COUNT(*) FROM " + QuoteIdent(ds.TableName)).Scan(&count); err != nil {
		return err
	}
	ds.RowCount = count
	_, err := s.rw.Exec("UPDATE _datasets SET row_count = ? WHERE id = ?", count, ds.ID)
	return err
}

func lookupColumn(columns []Column, name string) (Column, bool) {
	for _, column := range columns {
		if column.Name == name {
			return column, true
		}
	}
	for _, column := range columns {
		if strings.EqualFold(column.Name, name) {
			return column, true
		}
	}
	return Column{}, false
}
