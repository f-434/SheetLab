package api

import (
	"errors"
	"strings"
)

// validateSQL allows exactly one read-only SELECT/WITH statement.
// The SQLite handle used for queries is opened in read-only mode as a second
// line of defense.
func validateSQL(query string) error {
	code := strings.TrimSpace(stripSQL(query))
	for strings.HasSuffix(code, ";") {
		code = strings.TrimSpace(strings.TrimSuffix(code, ";"))
	}
	if code == "" {
		return errors.New("请输入 SQL 查询语句")
	}
	if strings.Contains(code, ";") {
		return errors.New("仅支持单条查询语句")
	}
	switch firstWord(code) {
	case "SELECT", "WITH":
		return nil
	default:
		return errors.New("仅支持 SELECT 或 WITH 查询语句")
	}
}

// stripSQL removes comments while blanking the content of quoted literals so
// that semicolons inside strings are not mistaken for statement separators.
func stripSQL(input string) string {
	var b strings.Builder
	b.Grow(len(input))
	for i := 0; i < len(input); {
		ch := input[i]
		switch {
		case ch == '\'' || ch == '"' || ch == '`':
			quote := ch
			b.WriteByte(quote)
			i++
			for i < len(input) {
				if input[i] == quote {
					if i+1 < len(input) && input[i+1] == quote {
						i += 2
						continue
					}
					b.WriteByte(quote)
					i++
					break
				}
				i++
			}
		case ch == '-' && i+1 < len(input) && input[i+1] == '-':
			for i < len(input) && input[i] != '\n' {
				i++
			}
			b.WriteByte('\n')
		case ch == '/' && i+1 < len(input) && input[i+1] == '*':
			i += 2
			for i+1 < len(input) && !(input[i] == '*' && input[i+1] == '/') {
				i++
			}
			if i+1 < len(input) {
				i += 2
			}
			b.WriteByte(' ')
		default:
			b.WriteByte(ch)
			i++
		}
	}
	return b.String()
}

func firstWord(code string) string {
	code = strings.TrimSpace(code)
	end := 0
	for end < len(code) {
		ch := code[end]
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') {
			end++
			continue
		}
		break
	}
	return strings.ToUpper(code[:end])
}
