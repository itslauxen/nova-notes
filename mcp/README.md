# Nova Notes — MCP server

A tiny [MCP](https://modelcontextprotocol.io) server that lets **Claude create, edit, list and search your [Nova Notes](https://novanotes.lauxen.dev) pages** straight from a chat.

It talks to your Nova Notes Supabase database and **signs in with your own account**, so Row Level Security keeps it scoped to *your* notes only.

## Tools

| Tool | What it does |
|---|---|
| `list_notes` | List your pages (id, title, emoji, tags, date). `goals_only` optional. |
| `search_notes` | Search pages by text in title/content. |
| `get_note` | Read a full page (Markdown content) by id. |
| `create_note` | Create a page (Markdown `content`; `parent_id` makes a subpage). |
| `update_note` | Update fields of a page (content **replaces** the current one). |
| `append_to_note` | Append Markdown to the end of a page. |
| `delete_note` | Delete a page permanently. |

## Setup

```bash
cd mcp
npm install
```

You need 4 values (the first two are the same ones in the app's `.env`):

- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_ANON_KEY` — the publishable key (`sb_publishable_…`)
- `NOVA_EMAIL` / `NOVA_PASSWORD` — the login of your Nova Notes account

> Content is **Markdown** — the same format Nova Notes stores. Claude can write Markdown and it renders in the app.

## Connect it to Claude

### Claude Desktop / Cowork

Add to your `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "nova-notes": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/nova-notes/mcp/index.js"],
      "env": {
        "SUPABASE_URL": "https://SEU-PROJETO.supabase.co",
        "SUPABASE_ANON_KEY": "sb_publishable_xxxx",
        "NOVA_EMAIL": "voce@email.com",
        "NOVA_PASSWORD": "sua-senha"
      }
    }
  }
}
```

Restart Claude. You should see the `nova-notes` tools available.

### Claude Code (CLI)

```bash
claude mcp add nova-notes \
  --env SUPABASE_URL=https://SEU-PROJETO.supabase.co \
  --env SUPABASE_ANON_KEY=sb_publishable_xxxx \
  --env NOVA_EMAIL=voce@email.com \
  --env NOVA_PASSWORD=sua-senha \
  -- node /ABSOLUTE/PATH/TO/nova-notes/mcp/index.js
```

## Try it

> "Create a Nova Notes page called *Groceries* with a checklist of milk, eggs and coffee."
>
> "Find my page about the video script and add a section with 3 hook ideas."

## Security

Everything runs **locally**. The credentials live only in your MCP client config on your machine — nothing is sent anywhere except your own Supabase. Don't commit `.env`, and prefer a Supabase project you control. Because the server authenticates as you, it can only touch rows your RLS policies already allow.
