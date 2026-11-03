package store

// Column describes a physical column of an imported dataset.
type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// Dataset is one imported Excel worksheet stored as a SQLite table.
type Dataset struct {
	ID          int64    `json:"id"`
	TableName   string   `json:"tableName"`
	DisplayName string   `json:"displayName"`
	SourceFile  string   `json:"sourceFile"`
	SheetName   string   `json:"sheetName"`
	RowCount    int64    `json:"rowCount"`
	CreatedAt   string   `json:"createdAt"`
	Columns     []Column `json:"columns"`
}

// RowPage is a page of rows read from a dataset.
type RowPage struct {
	Columns  []Column         `json:"columns"`
	Rows     []map[string]any `json:"rows"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
}

// QueryResult is the result of an ad-hoc read-only SQL query.
type QueryResult struct {
	Columns   []string `json:"columns"`
	Rows      [][]any  `json:"rows"`
	RowCount  int      `json:"rowCount"`
	Truncated bool     `json:"truncated"`
	ElapsedMs int64    `json:"elapsedMs"`
}
