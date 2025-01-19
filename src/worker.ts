import { Connection, RAL } from '@vscode/wasm-component-model';
import { lib } from './lib';

async function main(): Promise<void> {
    const connection = await Connection.createWorker(lib._);
    connection.listen();
}

main().catch(RAL().console.error);