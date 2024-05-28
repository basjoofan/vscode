import * as vscode from 'vscode';
import { spawn } from 'child_process';

export async function activate(context: vscode.ExtensionContext) {
  const ctrl = vscode.tests.createTestController('AmTestController', 'Am Test');
  context.subscriptions.push(ctrl);

  const fileChangedEmitter = new vscode.EventEmitter<vscode.Uri>();
  const watchingTests = new Map<vscode.TestItem | 'ALL', vscode.TestRunProfile | undefined>();
  fileChangedEmitter.event(uri => {
    if (watchingTests.has('ALL')) {
      startTestRun(new vscode.TestRunRequest(undefined, undefined, watchingTests.get('ALL'), true));
      return;
    }

    const include: vscode.TestItem[] = [];
    let profile: vscode.TestRunProfile | undefined;
    for (const [item, thisProfile] of watchingTests) {
      const cast = item as vscode.TestItem;
      if (cast.uri?.toString() == uri.toString()) {
        include.push(cast);
        profile = thisProfile;
      }
    }

    if (include.length) {
      startTestRun(new vscode.TestRunRequest(include, undefined, profile, true));
    }
  });

  const runHandler = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
    if (!request.continuous) {
      return startTestRun(request);
    }

    if (request.include === undefined) {
      watchingTests.set('ALL', request.profile);
      cancellation.onCancellationRequested(() => watchingTests.delete('ALL'));
    } else {
      request.include.forEach(item => watchingTests.set(item, request.profile));
      cancellation.onCancellationRequested(() => request.include!.forEach(item => watchingTests.delete(item)));
    }
  };

  const startTestRun = (request: vscode.TestRunRequest) => {
    const queue: vscode.TestItem[] = [];
    const run = ctrl.createTestRun(request);
    const discoverTests = async (tests: Iterable<vscode.TestItem>) => {
      for (const test of tests) {
        if (request.exclude?.includes(test)) {
          continue;
        } else {
          if (test.canResolveChildren) {
            discoverTests(gatherTestItems(test.children));
          } else {
            queue.push(test);
          }
        }
      }
    };
    const runTestQueue = async () => {
      for (const test of queue) {
        run.appendOutput(`Running ${test.uri} ${test.label}\r\n`);
        if (run.token.isCancellationRequested) {
          run.skipped(test);
        } else {
          run.started(test);
          const start = Date.now();
          const result = await new Promise<boolean>(resolve => {
            const child = spawn("am", ["call", test.label], { cwd: vscode.workspace.rootPath });
            if (child.pid) {
              child.stdout.on("data", data => {
                run.appendOutput(`${data}\r\n`);
              });
              child.stderr.on("data", data => {
                run.appendOutput(`error:${data}\r\n`);
              });
              child.on('close', code => {
                resolve(code === 0);
              });
            } else {
              run.appendOutput(`Command am execution failed, please check am is installed.\r\n`);
              resolve(false);
            }
          });
          const duration = Date.now() - start;
          if (result) {
            run.passed(test, duration);
          } else {
            // const message = vscode.TestMessage(`Expected ${item.label}`, String(this.expected), String(actual));
            run.failed(test, new vscode.TestMessage(`failed ${test.label}`), duration);
          }
        }
        run.appendOutput(`Completed ${test.id}\r\n`);
      }
      run.end();
    };
    discoverTests(request.include ?? gatherTestItems(ctrl.items)).then(runTestQueue);
  };

  ctrl.refreshHandler = async () => {
    await Promise.all(getWorkspaceTestPatterns().map(({ pattern }) => findInitialFiles(ctrl, pattern)));
  };

  ctrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandler, true, undefined, true);

  ctrl.resolveHandler = async item => {
    if (!item) {
      context.subscriptions.push(...startWatchingWorkspace(ctrl, fileChangedEmitter));
    } else {
      parseTestsInFileContents(ctrl, item);
    }
  };

  function parseTestsInDocument(e: vscode.TextDocument) {
    if (e.uri.scheme === 'file' && e.uri.path.endsWith('.am')) {
      parseTestsInFileContents(ctrl, getOrCreateFile(ctrl, e.uri), e.getText());
    }
  }

  for (const document of vscode.workspace.textDocuments) {
    parseTestsInDocument(document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(parseTestsInDocument),
    vscode.workspace.onDidChangeTextDocument(e => parseTestsInDocument(e.document)),
  );
}

async function parseTestsInFileContents(controller: vscode.TestController, file: vscode.TestItem, content?: string) {
  // If a document is open, VS Code already knows its contents. If this is being
  // called from the resolveHandler when a document isn't open, we'll need to
  // read them from disk ourselves.
  if (content === undefined) {
    const rawContent = await vscode.workspace.fs.readFile(file.uri!);
    content = new TextDecoder().decode(rawContent);
  }
  // parse test case to fill in test.children from the content...
  const children = [] as vscode.TestItem[];
  const lines = content.split('\n');
  for (let number = 0; number < lines.length; number++) {
    const current = lines[number].trim();
    const previous = number >= 1 ? lines[number - 1].trim() : "";
    if ((current.startsWith("rq") || current.startsWith("fn")) && (previous.startsWith("#[") && previous.endsWith("]"))) {
      const range = new vscode.Range(new vscode.Position(number, 0), new vscode.Position(number, current.length));
      const label = current.substring(2, current.startsWith("rq") ? current.indexOf("`") : current.indexOf("(")).trim();
      const id = `${file.uri}/${label}`;
      const item = controller.createTestItem(id, label, file.uri);
      item.range = range;
      children.push(item);
    }
  }
  file.children.replace(children);
}

function getOrCreateFile(controller: vscode.TestController, uri: vscode.Uri) {
  const existing = controller.items.get(uri.toString());
  if (existing) {
    return existing;
  }

  const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
  controller.items.add(file);
  file.canResolveChildren = true;
  return file;
}

function gatherTestItems(collection: vscode.TestItemCollection) {
  const items: vscode.TestItem[] = [];
  collection.forEach(item => items.push(item));
  return items;
}

function getWorkspaceTestPatterns() {
  if (!vscode.workspace.workspaceFolders) {
    return [];
  }

  return vscode.workspace.workspaceFolders.map(workspaceFolder => ({
    workspaceFolder,
    pattern: new vscode.RelativePattern(workspaceFolder, '**/*.am'),
  }));
}

async function findInitialFiles(controller: vscode.TestController, pattern: vscode.GlobPattern) {
  for (const file of await vscode.workspace.findFiles(pattern)) {
    getOrCreateFile(controller, file);
  }
}

function startWatchingWorkspace(controller: vscode.TestController, fileChangedEmitter: vscode.EventEmitter<vscode.Uri>) {
  return getWorkspaceTestPatterns().map(({ workspaceFolder, pattern }) => {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidCreate(uri => {
      getOrCreateFile(controller, uri);
      fileChangedEmitter.fire(uri);
    });
    watcher.onDidChange(async uri => {
      getOrCreateFile(controller, uri);
      fileChangedEmitter.fire(uri);
    });
    watcher.onDidDelete(uri => controller.items.delete(uri.toString()));

    findInitialFiles(controller, pattern);

    return watcher;
  });
}