# Pitfight

A first-person arena duel against one computer opponent. It runs in the browser from static files. No install step and no build.

## Run locally

Serve this folder over HTTP, then open the site. Opening `index.html` directly will not start the game, because the browser blocks module scripts from `file://` addresses.

From the project folder:

### Python

```bash
python -m http.server 8765
```

Open http://127.0.0.1:8765/

### Node

```bash
npx serve
```

Open the address printed in the terminal.

### Windows PowerShell

Use this if Python and Node are not installed. Paste it into PowerShell from the project folder, then open http://127.0.0.1:8765/

```powershell
$root = (Get-Location).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://127.0.0.1:8765/')
$listener.Start()
Write-Host 'Open http://127.0.0.1:8765/'
try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $types = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8' }
      if ($types.ContainsKey($ext)) { $context.Response.ContentType = $types[$ext] }
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $context.Response.StatusCode = 404
    }
    $context.Response.Close()
  }
} finally {
  $listener.Stop()
}
```

Stop the server with Ctrl+C.

## Play

Click **Enter the pit**.

- **W A S D** move and strafe
- **Mouse** aim
- **Left click** shoot
- **Esc** release the mouse
