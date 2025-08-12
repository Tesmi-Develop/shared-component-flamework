interface Patch {
	diff: <T>(prevState: T, nextState: T) => T;
	apply: <T>(state: T, patches: T) => T;
}

declare const patch: Patch;
export = patch;
