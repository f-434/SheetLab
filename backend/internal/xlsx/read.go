// Package xlsx reads worksheets from uploaded Excel workbooks.
package xlsx

import (
	"fmt"
	"io"
	"strings"

	"github.com/xuri/excelize/v2"
)

// Sheet is the raw, formatted cell data of one worksheet.
type Sheet struct {
	Name string
	Rows [][]string
}

// Read parses every worksheet in the workbook.
func Read(r io.Reader) ([]Sheet, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, fmt.Errorf("文件不是有效的 Excel 工作簿")
	}
	defer f.Close()

	names := f.GetSheetList()
	if len(names) == 0 {
		return nil, fmt.Errorf("工作簿中没有任何工作表")
	}

	sheets := make([]Sheet, 0, len(names))
	for _, name := range names {
		rows, err := f.GetRows(name)
		if err != nil {
			// Chartsheets and other non-grid sheets cannot be read as rows.
			if strings.Contains(strings.ToLower(err.Error()), "sheet") {
				continue
			}
			return nil, fmt.Errorf("读取工作表「%s」失败: %w", name, err)
		}
		sheets = append(sheets, Sheet{Name: name, Rows: rows})
	}
	if len(sheets) == 0 {
		return nil, fmt.Errorf("工作簿中没有可读取的数据工作表")
	}
	return sheets, nil
}
