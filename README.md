# anki-import-preflight

Offline preflight reports for Anki CSV/TSV imports. Check field counts, literal first-field conflicts, baseline changes and referenced media without opening or modifying your collection.

在把 CSV/TSV 导入 Anki 之前，先生成一份可保存、可放进 CI 的预检报告。适合批量制作学习卡片、审阅他人提供的文本牌组、检查导入文件更新。

## 为什么做这个 / Why this exists

Anki 已经提供文本导入和重复处理。本工具补充的是**导入前、离线、可重复执行的批次审阅**：把字段数错误、同一首字段的内容冲突、与旧导出的差异、媒体缺失集中列出。它不读 Anki 数据库，也不替代 Anki 的导入预览。

[Anki 官方文本导入说明](https://docs.ankiweb.net/manual/importing/text-files)说明了字段数量、首字段匹配和媒体要求。CSV 语法交给 [csv-parse](https://csv.js.org/parse/)，HTML 媒体引用交给 [htmlparser2](https://github.com/fb55/htmlparser2)，避免重写通用解析器。本项目是独立配套工具，与 Anki 官方无隶属关系。

## 快速开始

需要 Node.js 22 或更新版本。

```sh
git clone https://github.com/DrEli7/anki-import-preflight.git
cd anki-import-preflight
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm test
npm run demo
```

所有 examples 和测试夹具都是合成数据。演示故意包含一处首字段冲突、一处缺失音频，`--fail-on never` 允许完整展示报告。

实际使用：

```sh
node src/cli.mjs incoming.tsv --fields 3
node src/cli.mjs incoming.csv --fields 2 --delimiter comma --existing previous.csv --html --media-dir ./collection.media --format json
node src/cli.mjs incoming.csv --fields 2 --delimiter comma --format markdown > report.md
```

CLI 只读输入并向 stdout 输出；不会改写文件、打开数据库、上传数据或自动导入。重定向报告时请选择不同于输入的路径。安装依赖需要访问 npm，运行报告不需要网络。

## 参数

| 参数 | 用途 |
| --- | --- |
| `INPUT` | 恰好一个 UTF-8 文本文件，最大 20 MiB |
| `--fields N` | 必填，声明每条记录的总列数（1–1000），包括你选择保留的标签等列 |
| `--delimiter tab\|comma\|semicolon\|pipe` | 默认 tab；不猜测分隔符 |
| `--existing FILE` | 可选基准导出，必须与输入有相同列布局和比较范围 |
| `--html` | 启用 HTML/媒体检查；也可在输入顶部写 `#html:true` |
| `--media-dir DIRECTORY` | 检查该平铺目录中普通文件的名称；不递归，也不跟随目录项符号链接 |
| `--format markdown\|json` | 默认 Markdown；JSON 包含每条记录的比较状态 |
| `--fail-on error\|warning\|never` | 默认 error；warning 表示警告或错误均触发退出码 1 |
| `--help` | 显示帮助 |

退出码：`0` 未达到所选阈值；`1` 发现问题；`2` 参数、编码、读取或 CSV 语法失败。未知参数和重复参数会被拒绝。

## 报告含义

- `FIELD_COUNT`：某条记录列数与声明不一致，可能发生字段遗漏或截断。
- `EMPTY_FIRST_FIELD`：首字段为空或只有空白。
- `DUPLICATE_RECORD`：同一输入中出现完全相同的记录。
- `FIRST_FIELD_CONFLICT`：同一字面首字段对应不同的后续内容。
- `new / changed / unchanged`：与可选基准导出做**字面首字段**比较的结果。
- `AMBIGUOUS_EXISTING`：基准中有多个同首字段记录，不预测会更新哪一条。
- `MISSING_MEDIA / MEDIA_NOT_FLAT / REMOTE_MEDIA_UNCHECKED`：启用 HTML 模式后检查 `<img src>` 与 `[sound:...]`，远程媒体不请求。

记录编号从 1 开始，不计注释和空行；字段数错误另有 `endLine`，用于定位多行 CSV 记录。报告不输出卡片正文，缺失媒体会输出文件名。

## 必须理解的边界

这不是完整的 Anki 导入模拟器。比较前请把文件限定在同一笔记类型、同一导入匹配范围内，并将真正用于匹配的笔记首字段放在第一列。工具不推断笔记类型/牌组，不处理 GUID 匹配、模板、调度、cloze 语义、标签合并或 HTML 首字段归一化；字面 `a`、`a `、`<b>a</b>` 被视为不同值。`changed` 表示文本不同，不承诺 Anki 一定更新。

支持顶部 `#separator` 和 `#html` 指令，冲突会拒绝；其他 Anki 指令会标记 `HEADER_NOT_MODELED`。未启用 HTML 模式时，`<img>` 和 `[sound:...]` 作为普通文本，媒体检查标记为未执行。完整 Anki 多笔记类型导出请先在 Anki 中选择一致范围并整理列。

媒体目录必须平铺。只检查文件名是否存在，不验证文件内容、字体/CSS/模板媒体，也不下载 URL。单记录最大约 2 MB；文件在内存中处理，适合人工审阅级批次。

## JavaScript API

```js
import { auditImport, toMarkdown } from './src/index.mjs';

const report = auditImport('one,1\ntwo,2\n', {
  fields: 2,
  delimiter: 'comma',
  existingText: 'one,old\n',
  html: true,
  mediaFiles: ['photo.png'],
});
console.log(report.records); // changed, new
console.log(toMarkdown(report));
```

`auditImport` 不执行文件 I/O。JSON 报告含 `schemaVersion: 1`；字段会随未来版本增加，调用方应忽略未知字段。

## 开发与许可

```sh
npm test
```

测试包含 CSV 引号/多行/Unicode、首字段冲突、基准歧义、HTML 模式、媒体引用，以及真实 CLI 子进程和输入不变检查。CI 配置覆盖 Ubuntu/Windows、Node 22/24。MIT © 2026 DrEli7。贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。
