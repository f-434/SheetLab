import { IconDownload, IconInfo, IconSparkles, IconUpload } from './Icons'
import { UploadZone } from './UploadZone'

interface WelcomeProps {
  onImport: (file: File) => void
  onError: (message: string) => void
  importing: boolean
}

export function Welcome({ onImport, onError, importing }: WelcomeProps) {
  return (
    <section className="welcome">
      <div className="welcome-inner">
        <div className="welcome-copy">
          <span className="eyebrow">
            <IconSparkles size={14} />
            本地数据工作台
          </span>
          <h1>
            把 Excel 变成
            <br />
            <span className="gradient-text">可查询的数据</span>
          </h1>
          <p className="welcome-lead">
            导入 · 用 SQL 加工 · 导出结果。全程本地运行，数据不离开你的电脑。
          </p>
          <div className="welcome-upload">
            <UploadZone onFile={onImport} onError={onError} busy={importing} />
          </div>
          <div className="welcome-note">
            <IconInfo size={14} />
            <span>支持 .xlsx / .xlsm，多个工作表会自动拆成多张数据表</span>
          </div>
        </div>

        <div className="hero-preview" aria-hidden="true">
          <div className="preview-window">
            <div className="preview-dots">
              <i />
              <i />
              <i />
            </div>
            <pre className="preview-code">
              <span className="kw">SELECT</span> 区域, <span className="fn">SUM</span>(销售额){'\n'}
              <span className="kw">FROM</span> <span className="str">"销售数据"</span>{'\n'}
              <span className="kw">GROUP BY</span> 区域
            </pre>
            <div className="preview-grid">
              <div className="preview-row head">
                <span>区域</span>
                <span>销售额</span>
              </div>
              <div className="preview-row">
                <span>华东</span>
                <span>22,780</span>
              </div>
              <div className="preview-row">
                <span>华北</span>
                <span>23,374</span>
              </div>
              <div className="preview-row">
                <span>华南</span>
                <span>14,970</span>
              </div>
            </div>
            <div className="preview-badge">
              <IconDownload size={14} />
              导出 Excel
            </div>
          </div>
          <div className="preview-glow" />
          <div className="preview-float">
            <IconUpload size={15} />
            <span>多工作表自动拆表</span>
          </div>
        </div>
      </div>

      <div className="welcome-steps">
        <div className="step-card">
          <span className="step-num">01</span>
          <h3>导入 Excel</h3>
          <p>首行作为列名，自动识别整数、小数与文本类型。</p>
        </div>
        <div className="step-card">
          <span className="step-num">02</span>
          <h3>编写 SQL</h3>
          <p>手动查询、聚合、多表 JOIN，仅允许只读语句。</p>
        </div>
        <div className="step-card">
          <span className="step-num">03</span>
          <h3>导出结果</h3>
          <p>查询结果一键导出为 xlsx，完整保留全部数据行。</p>
        </div>
      </div>
    </section>
  )
}
