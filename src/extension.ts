import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { sep } from 'path';
import { WasmContext, Memory } from '@vscode/wasm-component-model';
import { lib } from './lib';

export async function activate(context: vscode.ExtensionContext) {
  // The channel for printing the log.
  const log = vscode.window.createOutputChannel('Am - Log', { log: true });
  context.subscriptions.push(log);

  // Load the Wasm module
  const filename = vscode.Uri.joinPath(context.extensionUri, 'target', 'wasm32-unknown-unknown', 'debug', 'lib.wasm');
  const bits = await vscode.workspace.fs.readFile(filename);
  const module = await WebAssembly.compile(bits);

  // The implementation of the log function that is called from WASM
  const service: lib.Imports = {
    log: (msg: string) => {
      log.info(msg);
    }
  };

  // The context for the WASM module
  const wasmContext: WasmContext.Default = new WasmContext.Default();

  // Create the bindings to import the log function into the WASM module
  const imports = lib._.imports.create(service, wasmContext);
  // Instantiate the module
  const instance = await WebAssembly.instantiate(module, imports);

  // Bind the WASM memory to the context
  wasmContext.initialize(new Memory.Default(instance.exports));

  // Bind the TypeScript Api
  const api = lib._.exports.bind(instance.exports as lib._.Exports, wasmContext);
  const results = api.run('case');
  for (let i = 0; i < results.length; i++) {
    log.info(results[i]);
    log.info(`results[${i}]: ${results[i]}`);
  }

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

    const appendOutput = (chunk: string) => {
      for (; ;) {
        const index = chunk.indexOf('\n');
        if (index === -1) break;
        const line = chunk.substring(0, index);
        chunk = chunk.substring(index + 1);
        run.appendOutput(`${line}\r\n`);
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
            api.run(getWorkspacePath(test.uri)!);
            // const child = spawn('am', ['blow', test.label], { cwd: getWorkspacePath(test.uri) });
            // if (child.pid) {
            //   let buffer = '';
            //   child.stdout.on('data', data => {
            //     const chunk = data.toString();
            //     appendOutput(chunk);
            //     buffer += chunk;
            //   });
            //   child.stderr.on('data', data => {
            //     const chunk = data.toString();
            //     appendOutput(chunk);
            //     buffer += chunk;
            //   });
            //   child.on('close', code => {
            //     if (!buffer.match(/.*FAIL.*/) && code === 0) {
            //       resolve(true);
            //     } else {
            //       resolve(false);
            //     }
            //   });
            // } else {
            //   run.appendOutput(`Command am execution failed, please check am is installed.\r\n`);
            //   resolve(false);
            // }
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
    if (current.startsWith('test') && current.endsWith('{')) {
      const range = new vscode.Range(new vscode.Position(number, 0), new vscode.Position(number, current.length));
      const label = current.substring(4, current.length - 2).trim();
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

function getWorkspacePath(uri: vscode.Uri | undefined): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && uri) {
    for (const workspaceFolder of workspaceFolders) {
      if (uri.fsPath.startsWith(workspaceFolder.uri.fsPath + sep)) {
        return workspaceFolder.uri.fsPath;
      }
    }
  }
  return undefined;
}