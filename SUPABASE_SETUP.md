# Supabase setup for the giant book

このサイトの「巨大な本」にあるメッセージ機能を、端末内だけではなく共有できるようにするためのセットアップです。

## 1. Supabase プロジェクトを作る

1. Supabase にログイン
2. `New project`
3. Project name は好きな名前でOK
4. Region は近い場所でOK
5. Database password を決める
6. 作成完了まで待つ

## 2. messages テーブルを作る

1. 左メニュー `SQL Editor`
2. `New query`
3. `/Users/assmagic/Desktop/飛行３/supabase-book-messages.sql` の中身を貼る
4. `Run`

これで次のことができます。
- メッセージを読む
- 匿名でメッセージを書く

## 3. 公開用キーを確認する

1. 左メニュー `Project Settings`
2. `API`
3. 次の 2 つを控える
   - `Project URL`
   - `anon public` key

`anon public` key はブラウザに置く前提の公開キーです。このサイトのような静的サイトではこれを使います。

## 4. サイトにキーを入れる

1. `/Users/assmagic/Desktop/飛行３/supabase-config.js` を開く
2. こう書き換える

```js
export const supabaseConfig = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_ANON_PUBLIC_KEY',
  table: 'book_messages'
};
```

## 5. 公開版に反映する

```bash
cd "/Users/assmagic/Desktop/飛行３"
git add supabase-config.js main.js index.html SUPABASE_SETUP.md supabase-book-messages.sql
git commit -m "Connect book messages to Supabase"
git push
```

## 6. 動作確認

1. 公開サイトを開く
2. 巨大な本に触れる
3. `何か書き残す` から投稿する
4. 別の端末で開いて `読んでみる` に出るか確認する

## 補足

- Supabase 未接続のときは、今まで通りこの端末の `localStorage` に保存されます
- Supabase をつなぐと、共有メッセージが優先されます
- 将来テーブル名を変えたい場合は `/Users/assmagic/Desktop/飛行３/supabase-config.js` の `table` を変えるだけです
