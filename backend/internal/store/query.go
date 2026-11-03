package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// RunQuery executes a read-only SQL query against the dataset database.
func (s *Store) RunQuery(ctx context.Context, query string, limit int) (*QueryResult, error) {
	started := time.Now()
	rows, err := s.ro.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	result := &QueryResult{Columns: columns, Rows: make([][]any, 0)}

	for rows.Next() {
		if limit > 0 && len(result.Rows) >= limit {
			result.Truncated = true
			break
		}
		values, err := scanValues(rows, len(columns))
		if err != nil {
			return nil, err
		}
		result.Rows = append(result.Rows, values)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result.RowCount = len(result.Rows)
	result.ElapsedMs = time.Since(started).Milliseconds()
	return result, nil
}

func scanValues(rows *sql.Rows, n int) ([]any, error) {
	values := make([]any, n)
	pointers := make([]any, n)
	for i := range values {
		pointers[i] = &values[i]
	}
	if err := rows.Scan(pointers...); err != nil {
		return nil, err
	}
	for i, v := range values {
		values[i] = normalizeValue(v)
	}
	return values, nil
}

func normalizeValue(v any) any {
	switch value := v.(type) {
	case []byte:
		return string(value)
	case time.Time:
		return value.Format("2006-01-02 15:04:05")
	default:
		return value
	}
}

func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

func normalizeInput(v any, column Column) (any, error) {
	if v == nil {
		return nil, nil
	}
	var raw string
	switch value := v.(type) {
	case string:
		raw = value
	case float64:
		raw = strconv.FormatFloat(value, 'f', -1, 64)
	case json.Number:
		raw = value.String()
	case bool:
		if value {
			raw = "1"
		} else {
			raw = "0"
		}
	default:
		raw = fmt.Sprint(value)
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}

	switch strings.ToUpper(column.Type) {
	case "INTEGER":
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("字段「%s」需要整数", column.Name)
		}
		return n, nil
	case "REAL":
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, fmt.Errorf("字段「%s」需要数字", column.Name)
		}
		return f, nil
	default:
		return raw, nil
	}
}
