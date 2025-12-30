interface Patch {
	diff: <T>(prevState: T, nextState: T) => T;
	apply: <T>(state: T, patches: T) => T;
	None: { __none: string };
}

declare const patch: Patch;
export = patch;
