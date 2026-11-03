package store

import (
	"context"

	"github.com/xuri/excelize/v2"
)

// ExportQueryXLSX runs a read-only query and renders every row into an xlsx workbook.
func (s *Store) ExportQueryXLSX(ctx context.Context, query string) ([]byte, error) {
	rows, err := s.ro.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer f.Close()

	const sheet = "查询结果"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}

	headerStyle, err := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 11},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"0EA58A"}},
		Alignment: &excelize.Alignment{Vertical: "center", Horizontal: "left"},
	})
	if err != nil {
		return nil, err
	}

	sw, err := f.NewStreamWriter(sheet)
	if err != nil {
		return nil, err
	}

	for i, column := range columns {
		width := float64(len([]rune(column)))*2 + 6
		if width < 12 {
			width = 12
		}
		if width > 42 {
			width = 42
		}
		// StreamWriter requires column widths to be set before any row is written.
		if err := sw.SetColWidth(i+1, i+1, width); err != nil {
			return nil, err
		}
	}

	header := make([]any, len(columns))
	for i, column := range columns {
		header[i] = column
	}
	cell, _ := excelize.CoordinatesToCellName(1, 1)
	if err := sw.SetRow(cell, header, excelize.RowOpts{Height: 24, StyleID: headerStyle}); err != nil {
		return nil, err
	}

	rowNumber := 2
	for rows.Next() {
		values, err := scanValues(rows, len(columns))
		if err != nil {
			return nil, err
		}
		cell, _ := excelize.CoordinatesToCellName(1, rowNumber)
		if err := sw.SetRow(cell, values); err != nil {
			return nil, err
		}
		rowNumber++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := sw.Flush(); err != nil {
		return nil, err
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
