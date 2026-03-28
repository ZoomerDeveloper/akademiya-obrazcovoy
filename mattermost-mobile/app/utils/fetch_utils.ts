// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

type RetryOptions = {
    retries?: number;
    timeoutMs?: number;
    retryDelayMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10000;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, {...init, signal: controller.signal});
    } finally {
        clearTimeout(id);
    }
}

export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, options?: RetryOptions) {
    const retries = options?.retries ?? 2;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retryDelayMs = options?.retryDelayMs ?? 400;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(input, init, timeoutMs);
            if (response.ok) {
                return response;
            }

            // Retry only on transient server issues and throttling.
            if ((response.status >= 500 || response.status === 429) && attempt < retries) {
                await sleep(retryDelayMs * (attempt + 1));
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                await sleep(retryDelayMs * (attempt + 1));
                continue;
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Network request failed');
}
