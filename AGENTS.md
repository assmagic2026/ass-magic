# ASS MAGIC 公開先の確認

公開サイトを編集する前に、ユーザーが指定したURLと編集先を照合する。

| URL | リポジトリ | 編集先 |
| --- | --- | --- |
| `https://assmagic2026.github.io/` | `assmagic2026/assmagic2026.github.io` | `index.html`（トップのメニュー） |
| `https://assmagic2026.github.io/ass-magic/` | このリポジトリの `main` | 通常の飛行画面は `experiments/realism/planet-full.html`、`?legacy=1` は `index.html` |
| `https://flying-c8s.pages.dev/experiments/realism/planet-full` | このリポジトリの `main` | `experiments/realism/planet-full.html` |

- 手元の `file://` はその時点のチェックアウトを表示する。公開版との一致を前提にしない。
- 編集前に `git branch --show-current` と `git status --short` を確認する。公開用の変更は最新の `origin/main` を基に分離して行い、既存の未コミット変更を保持する。
- 公開したと報告する前に、指定された公開URLを再読み込みし、実際の表示とリンク先を確認する。
