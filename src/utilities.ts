type GeneratorIdReturning<T extends boolean> = T extends true ? string : number;

export const CreateGeneratorId = <C extends boolean>(isString = false as C) => {
	const instance = {
		freeId: 0,
		Next: (): GeneratorIdReturning<C> => {
			const id = instance.freeId;
			instance.freeId += 1;
			return (isString ? `${id}` : id) as GeneratorIdReturning<C>;
		},
	};

	return instance as { Next: () => GeneratorIdReturning<C> };
};

export const consolePrefix = `SharedComponets`;
const errorString = `--// [${consolePrefix}]: Caught an error in your code //--`;
const warnString = `--// [${consolePrefix}] //--`;

export function logError(Message: string, DisplayTraceback = true): never {
	return error(`\n ${errorString} \n ${Message} \n \n ${DisplayTraceback && debug.traceback()}`);
}

export function logWarning(Message: string) {
	warn(`\n ${warnString} \n ${Message} \n`);
}

export function logAssert<T>(condition: T, message: string, DisplayTraceback = true): asserts condition {
	!condition && logError(message, DisplayTraceback);
}
