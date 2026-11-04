# anki-import-preflight

Offline preflight reports for Anki CSV/TSV imports. Check field counts, literal first-field conflicts, baseline changes and referenced media without opening or modifying your collection.

Generate a report to save or use in CI before importing text notes. Useful for batch flashcard authoring, reviewing shared text decks and checking updates against earlier exports.

## Why this exists

Anki already provides text imports and duplicate handling. This companion adds repeatable, offline batch review before import: field-count errors, conflicts sharing a first field, baseline differences and missing media in one report. It does not read Anki's database or replace its import preview.

The [Anki text import manual](https://docs.ankiweb.net/manual/importing/text-files) explains field counts, first-field matching and media requirements. CSV syntax uses [csv-parse](https://csv.js.org/parse/); HTML media references use [htmlparser2](https://github.com/fb55/htmlparser2). This is an independent companion, unaffiliated with Anki.

## Quick start

Requires Node.js 22 or newer.

```sh
git clone https://github.com/DrEli7/anki-import-preflight.git
cd anki-import-preflight
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm test
npm run demo
```

All examples and test fixtures are synthetic. The demo deliberately contains a first-field conflict and a missing audio file. It uses `--fail-on never` to display the complete report.

```sh
node src/cli.mjs incoming.tsv --fields 3
node src/cli.mjs incoming.csv --fields 2 --delimiter comma --existing previous.csv --html --media-dir ./collection.media --format json
node src/cli.mjs incoming.csv --fields 2 --delimiter comma --format markdown > report.md
```

The CLI reads inputs and writes to stdout. It does not change files, open databases, upload data or import notes. Redirect reports to a path different from the input. Installing dependencies needs npm access; generating reports needs no network connection.

## Options

| Option | Purpose |
| --- | --- |
| `INPUT` | Exactly one UTF-8 text file, up to 20 MiB |
| `--fields N` | Required total column count per record (1–1000), including retained tag or other columns |
| `--delimiter tab\|comma\|semicolon\|pipe` | Defaults to tab; separators are not guessed |
| `--existing FILE` | Optional baseline with the same column layout and comparison scope |
| `--html` | Enable HTML/media checks; alternatively use a top-of-file `#html:true` |
| `--media-dir DIRECTORY` | Check regular filenames in a flat directory; no recursion or directory-entry symlinks |
| `--format markdown\|json` | Defaults to Markdown; JSON includes each record's comparison status |
| `--fail-on error\|warning\|never` | Defaults to error; warning makes warnings or errors trigger exit code 1 |
| `--help` | Show help |

Exit codes: `0` means the selected threshold was not reached; `1` means findings reached the threshold; `2` means an argument, encoding, read or CSV syntax failure. Unknown and duplicate options are rejected.

## Reading the report

- `FIELD_COUNT`: a record's column count differs from the declaration, risking omitted or truncated fields.
- `EMPTY_FIRST_FIELD`: the first field is empty or whitespace-only.
- `DUPLICATE_RECORD`: an identical record appears earlier in the input.
- `FIRST_FIELD_CONFLICT`: the same literal first field has different remaining content.
- `new / changed / unchanged`: literal first-field comparison with the optional baseline.
- `AMBIGUOUS_EXISTING`: multiple baseline records share the first field; no update target is predicted.
- `MISSING_MEDIA / MEDIA_NOT_FLAT / REMOTE_MEDIA_UNCHECKED`: checks `<img src>` and `[sound:...]` in HTML mode, without fetching remote media.

Record numbers start at 1, excluding comments and empty lines. Field-count findings include `endLine` for locating multiline CSV records. Reports omit note contents; missing-media findings include filenames.

## Scope and limitations

This is not a complete Anki import simulator. Limit both files to one note type and the same import matching scope, and put the actual matching note field in the first column. The tool does not infer note types/decks or model GUID matching, templates, scheduling, cloze semantics, tag merging or HTML normalization of first fields. Literal `a`, `a ` and `<b>a</b>` are different values. `changed` means text differs, not that Anki will necessarily update a note.

Top-of-file `#separator` and `#html` directives are supported; conflicts are rejected. Other Anki directives produce `HEADER_NOT_MODELED`. Without HTML mode, `<img>` and `[sound:...]` remain plain text and media checks are marked as not performed. For exports with multiple note types, first select a consistent scope in Anki and arrange the columns.

Media must be in a flat directory. Checks establish filename presence only, not file contents, font/CSS/template media or URL availability. Individual records are limited to approximately 2 MB. Files are processed in memory, suitable for review-sized batches.

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

`auditImport` performs no file I/O. JSON reports contain `schemaVersion: 1`; consumers should ignore unknown fields added in future versions.

## Development and license

Run `npm test`. Tests cover CSV quoting, multiline fields, Unicode, first-field conflicts, ambiguous baselines, HTML mode, media references, real CLI subprocesses and input preservation. CI covers Ubuntu/Windows and Node 22/24. MIT © 2026 DrEli7. See [CONTRIBUTING.md](CONTRIBUTING.md).
