import type { MockHandler } from './router';

/** The real API has already authorised the dispatcher by the time a fixture answers. */
export const dispatcher = (handler: MockHandler): MockHandler => handler;
