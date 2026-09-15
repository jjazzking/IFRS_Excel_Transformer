/**
 * 데스크톱 껍데기. 브라우저 판과 **같은 `dist/` 를 그대로** 띄운다 — 화면 코드는
 * 한 줄도 따로 두지 않는다.
 *
 * `file://` 로 띄우지 않는 이유가 핵심이다. OCR 은 워커에서 WebAssembly 를 `fetch`
 * 로 받아 오는데, Chromium 은 `file://` 에 대한 `fetch` 를 막는다. 그러면 스캔
 * 페이지를 만나는 순간 조용히 죽는다. 그래서 **우리만 아는 로컬 스킴**을 하나 만들어
 * 거기서 낸다. 포트를 열지 않으므로 서버가 아니고, 바깥으로 나가는 길도 없다
 * (`docs/minutes-plan.md` 0장 벽 2 — 파일이 기계 밖으로 나가지 않는다).
 */
const { app, BrowserWindow, protocol, net, session, shell, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'desk';

// Chromium 은 가만 두면 부품 갱신·목록 확인으로 바깥에 말을 건다 (`redirector.gvt1.com`).
// 이 앱은 의사록을 여는 도구다. **아무 말도 걸지 않아야 한다.**
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationHints');

// 표준 스킴으로 등록해야 origin 이 생긴다. origin 이 없으면 워커·wasm·fetch 가
// 전부 막힌다. 등록은 `app.whenReady()` **전에** 해야 한다.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/** 배포본에서는 `dist/` 가 asar 안에 들어간다. `getAppPath()` 가 양쪽을 다 가리킨다. */
function distRoot() {
  return path.join(app.getAppPath(), 'dist');
}

function resolveInDist(urlPath) {
  const root = distRoot();
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html';
  const full = path.join(root, rel);
  // 상위로 빠져나가는 경로는 거절한다. 스킴이 우리 것이어도 경로는 검사한다.
  const prefix = root + path.sep;
  return full === root || full.startsWith(prefix) ? full : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: '기준서 데스크',
    backgroundColor: '#f8fafc',
    show: false,
    webPreferences: {
      // 화면 코드는 Node 를 쓰지 않는다. 열어 둘 이유가 없다.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // 바깥 링크는 기본 브라우저로 보낸다. 앱 창이 다른 사이트로 넘어가지 않게 한다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://`)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(`${SCHEME}://app/index.html`);
  return win;
}

// 창 하나만 띄운다. 두 번째 실행은 이미 있는 창을 살린다.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // **바깥으로 나가는 길을 끊는다** (`docs/minutes-plan.md` 0장 벽 2). 실수로 CDN 을
    // 하나 끼워 넣어도 여기서 막히고, 조용히 이상해지는 대신 로그에 바로 드러난다.
    //
    // 막는 것은 **망으로 나가는 스킴만**이다. `file:` 까지 막으면 안 된다 — 우리 스킴
    // 핸들러가 `net.fetch(file://…)` 로 asar 안을 읽기 때문에, 그것까지 막으면 앱이
    // 아예 안 뜬다. 실제로 그렇게 만들었다가 포장본에서 잡았다.
    const BLOCKED = /^(https?|wss?|ftp):/i;
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      if (BLOCKED.test(details.url)) {
        console.warn('바깥으로 나가려는 요청을 막았다:', details.url);
        return callback({ cancel: true });
      }
      callback({ cancel: false });
    });

    protocol.handle(SCHEME, (request) => {
      const full = resolveInDist(new URL(request.url).pathname);
      if (!full) return new Response('not found', { status: 404 });
      return net.fetch(pathToFileURL(full).toString());
    });

    // 기본 메뉴에는 개발자 항목이 섞여 있다. 쓰는 사람에게 필요한 것만 남긴다.
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: '파일',
        submenu: [{ role: 'quit', label: '끝내기' }],
      },
      {
        label: '편집',
        submenu: [
          { role: 'undo', label: '되돌리기' }, { role: 'redo', label: '다시' },
          { type: 'separator' },
          { role: 'cut', label: '잘라내기' }, { role: 'copy', label: '복사' },
          { role: 'paste', label: '붙여넣기' }, { role: 'selectAll', label: '모두 선택' },
        ],
      },
      {
        label: '보기',
        submenu: [
          { role: 'reload', label: '새로 고침' },
          { role: 'resetZoom', label: '기본 크기' },
          { role: 'zoomIn', label: '크게' }, { role: 'zoomOut', label: '작게' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '전체 화면' },
        ],
      },
    ]));

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
