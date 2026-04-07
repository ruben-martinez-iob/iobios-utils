# Chrome en modo debug con la extensión cargada

## Comando

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --remote-allow-origins='*' \
  --user-data-dir=$HOME/.chrome-debug-profile \
  --load-extension=/home/ruben/workspaces/iob/iobios-chrome-extension \
  --no-first-run \
  "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a" \
  > /tmp/chrome.log 2>&1 &
sleep 5
curl -s http://localhost:9222/json | python3 -c "import json,sys; [print(t['type'], t['url'][:80]) for t in json.load(sys.stdin)]"
```

La última línea confirma que el debug port responde. Debe mostrar al menos una línea `page https://www.appsheet.com/...`.

## Conectar desde Python (CDP)

```python
import json, websocket, urllib.request

res = urllib.request.urlopen('http://localhost:9222/json').read()
targets = json.loads(res)
ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t.get('type') == 'page')
ws = websocket.create_connection(ws_url)

def send(method, params={}):
    import uuid
    mid = int(str(uuid.uuid4().int)[:8])
    ws.send(json.dumps({"id": mid, "method": method, "params": params}))
    while True:
        r = json.loads(ws.recv())
        if r.get('id') == mid:
            return r
```

## Notas

- `DISPLAY=:1` — display X11 del usuario (verificado con `ls /tmp/.X11-unix/`)
- `XAUTHORITY=/home/rubenm/.Xauthority` — necesario para autenticar con el servidor X
- `--user-data-dir=/tmp/chrome-debug` — perfil temporal aislado; el usuario debe hacer login en AppSheet cada vez
- Si el puerto 9222 no responde tras 5 segundos, revisar `/tmp/chrome.log`
