/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared runtime store for the Feishu plugin.
 *
 * Allows modules such as the logger to access the plugin runtime without
 * importing LarkClient directly, which would otherwise create static cycles.
 */

import type { OpenClawPluginApi, PluginRuntime } from 'openclaw/plugin-sdk/core';

const RUNTIME_NOT_INITIALIZED_ERROR =
  'Feishu plugin runtime has not been initialised. ' +
  'Ensure LarkClient.setRuntime() is called during plugin activation.';

let runtime: PluginRuntime | null = null;
let runInBackgroundContext: OpenClawPluginApi['lifecycle']['runInBackgroundContext'];

export function setLarkRuntime(
  nextRuntime: PluginRuntime,
  backgroundRunner?: typeof runInBackgroundContext,
): void {
  runtime = nextRuntime;
  runInBackgroundContext = backgroundRunner;
}

export function runLarkBackgroundWork<T>(run: () => T): T {
  return runInBackgroundContext ? runInBackgroundContext(run) : run();
}

export function tryGetLarkRuntime(): PluginRuntime | null {
  return runtime;
}

export function getLarkRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error(RUNTIME_NOT_INITIALIZED_ERROR);
  }
  return runtime;
}
