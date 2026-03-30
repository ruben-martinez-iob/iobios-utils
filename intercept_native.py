import json, websocket, urllib.request, time, threading

res = urllib.request.urlopen('http://localhost:9222/json').read()
targets = json.loads(res)
page = next((t for t in targets if t.get('type') == 'page'), None)
if not page:
    print("No page target found"); exit(1)

ws = websocket.create_connection(page['webSocketDebuggerUrl'])

def send(method, params={}):
    import uuid
    mid = int(str(uuid.uuid4().int)[:8])
    ws.send(json.dumps({"id": mid, "method": method, "params": params}))
    while True:
        r = json.loads(ws.recv())
        if r.get('id') == mid:
            return r

send("Network.enable")
send("Network.setRequestInterception", {"patterns": [{"urlPattern": "*/api/template/*", "interceptionStage": "Request"}]})

print("Escuchando peticiones a /api/template/ — haz un Add nativo en AppSheet ahora.\nCtrl+C para parar.\n")

request_bodies = {}

try:
    while True:
        msg = json.loads(ws.recv())
        method = msg.get('method', '')

        if method == 'Network.requestIntercepted':
            p = msg['params']
            iid = p['interceptionId']
            req = p['request']
            url = req['url']
            headers = req.get('headers', {})
            body = req.get('postData', '')
            # Only log /table/ row requests (not full syncs)
            if '/table/' in url and body:
                print(f"\n→ [{req['method']}] {url}")
                print(f"  Headers: {json.dumps(headers, indent=2)}")
                try:
                    parsed = json.loads(body)
                    print(f"  Body: {json.dumps(parsed, indent=2)}")
                except:
                    print(f"  Body (raw): {body[:500]}")
            send("Network.continueInterceptedRequest", {"interceptionId": iid})
except KeyboardInterrupt:
    print("\nParado.")