# Marpo - Marp Online Collaborative Editor

React, Monaco Editor, Yjs, そして Go (Golang) を使用して構築する、Marp のためのオンライン共同編集アプリケーションです。

## 概要 (Overview)

このアプリケーションは、複数のユーザーがリアルタイムで Markdown スライドを共同編集できる Web アプリケーションです。編集内容は即座に他の共同編集者に同期され、Marp によるスライドプレビューもリアルタイムで更新されます。

## 現在の実装状況

### 実装済み機能
- ✅ Markdownファイルの新規作成
- ✅ 既存ファイルの選択と編集
- ✅ MonacoエディタによるMarkdown編集
- ✅ WebSocketを使用したリアルタイム共同編集
- ✅ ファイルの自動保存

### 実装予定の機能
- 🔄 Marpプレビューの完全な統合
- 🔄 ユーザーカーソル位置の同期
- 🔄 コメント・注釈機能
- 🔄 ユーザー認証
- 🔄 Chakra UI 

## 技術スタック (Tech Stack)

### フロントエンド
- React: UIフレームワーク
- Monaco Editor: コードエディタ
- @marp-team/marp-core: Markdownスライド変換
- Yjs: CRDTによるデータ同期
- y-websocket: WebSocket通信
- y-monaco: MonacoエディタとYjsの連携

### バックエンド
- Go: WebSocketサーバー
- gorilla/websocket: WebSocket実装
- gorilla/mux: ルーティング
- ファイルベースのストレージ

## プロジェクト構成

本プロジェクトは、バックエンドに Go を採用することから、Standard Go Project Layout に準拠したディレクトリ構成を採用します。これにより、コードの責務が明確になり、プロジェクトの見通しが良くなります。

```
.
├── cmd/
│   └── server/main.go      # WebSocketサーバーの起動ロジック
├── internal/
│   └── websocket/          # WebSocketのハンドラやルーム管理のロジック
└── web/
    └── ...                 # Reactフロントエンドのソースコード
```

## 主要機能の実装方針 (Implementation Details)

### コメント・注釈機能

この機能は Yjs と Monaco Editor の機能を組み合わせて実現します。

1.  **データ構造**: コメントのリストを `Y.Array<Y.Map>` として Yjs ドキュメント内で管理します。各コメントは `Y.Map` で表現され、コメント内容、投稿者、そして位置情報を含みます。
2.  **位置情報の保持**: テキストが編集されてもコメントの位置がずれないように、Yjs の **`RelativePosition`** を使用してテキスト内の相対位置を堅牢に保存します。
3.  **GUI**: React で Yjs のコメント用 `Y.Array` の変更を監視します。変更を検知したら、Monaco Editor の **`Decorations API`** を使用して、エディタの該当行にアイコンを表示したり、関連テキストをハイライトしたりします。

## 開発の進め方 (Development Roadmap)

1.  **環境構築**: React + Monaco Editor でスタンドアロンの Markdown エディタを作成する。
2.  **共同編集のプロトタイピング**: 公式の `y-websocket` (Node.js) サーバーを使い、フロントエンドの共同編集機能を先行して実装・検証する。
3.  **Go WebSocketサーバーの実装**: `y-websocket` の挙動を参考に、Go で独自の WebSocket リレーサーバーを実装し、Node.js サーバーと置き換える。
4.  **Marpプレビュー機能の実装**: エディタの変更を検知し、`@marp-team/marp-core` で HTML に変換してプレビュー表示する。
5.  **コメント機能の実装**: Yjs と Monaco Editor の API を連携させ、コメント機能を追加する。
6.  **永続化と認証**: ドキュメントの保存/読み込み機能や、必要に応じてユーザー認証機能を追加する。