/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/ban-types */
import * as $wcm from '@vscode/wasm-component-model';
import type { i32, ptr } from '@vscode/wasm-component-model';

export namespace lib {
	export type Imports = {
		log: (msg: string) => void;
		get: (url: string) => string;
	};
	export namespace Imports {
		export type Promisified = $wcm.$imports.Promisify<Imports>;
	}
	export namespace imports {
		export type Promisify<T> = $wcm.$imports.Promisify<T>;
	}
	export type Exports = {
		run: (text: string) => string[];
	};
	export namespace Exports {
		export type Promisified = $wcm.$exports.Promisify<Exports>;
	}
	export namespace exports {
		export type Promisify<T> = $wcm.$exports.Promisify<T>;
	}
}

export namespace lib.$ {
	export namespace imports {
		export const log = new $wcm.FunctionType<lib.Imports['log']>('log',[
			['msg', $wcm.wstring],
		], undefined);
		export const get = new $wcm.FunctionType<lib.Imports['get']>('get',[
			['url', $wcm.wstring],
		], $wcm.wstring);
	}
	export namespace exports {
		export const run = new $wcm.FunctionType<lib.Exports['run']>('run',[
			['text', $wcm.wstring],
		], new $wcm.ListType<string>($wcm.wstring));
	}
}
export namespace lib._ {
	export const id = 'vscode:am/lib' as const;
	export const witName = 'lib' as const;
	export type $Root = {
		'log': (msg_ptr: i32, msg_len: i32) => void;
		'get': (url_ptr: i32, url_len: i32, result: ptr<string>) => void;
	};
	export namespace imports {
		export const functions: Map<string, $wcm.FunctionType> = new Map([
			['log', $.imports.log],
			['get', $.imports.get]
		]);
		export function create(service: lib.Imports, context: $wcm.WasmContext): Imports {
			return $wcm.$imports.create<Imports>(_, service, context);
		}
		export function loop(service: lib.Imports, context: $wcm.WasmContext): lib.Imports {
			return $wcm.$imports.loop<lib.Imports>(_, service, context);
		}
	}
	export type Imports = {
		'$root': $Root;
	};
	export namespace exports {
		export const functions: Map<string, $wcm.FunctionType> = new Map([
			['run', $.exports.run]
		]);
		export function bind(exports: Exports, context: $wcm.WasmContext): lib.Exports {
			return $wcm.$exports.bind<lib.Exports>(_, exports, context);
		}
	}
	export type Exports = {
		'run': (text_ptr: i32, text_len: i32, result: ptr<string[]>) => void;
	};
	export function bind(service: lib.Imports, code: $wcm.Code, context?: $wcm.ComponentModelContext): Promise<lib.Exports>;
	export function bind(service: lib.Imports.Promisified, code: $wcm.Code, port: $wcm.RAL.ConnectionPort, context?: $wcm.ComponentModelContext): Promise<lib.Exports.Promisified>;
	export function bind(service: lib.Imports | lib.Imports.Promisified, code: $wcm.Code, portOrContext?: $wcm.RAL.ConnectionPort | $wcm.ComponentModelContext, context?: $wcm.ComponentModelContext | undefined): Promise<lib.Exports> | Promise<lib.Exports.Promisified> {
		return $wcm.$main.bind(_, service, code, portOrContext, context);
	}
}