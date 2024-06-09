import { Reflect } from "@flamework/core";
import { AbstractConstructor, Constructor } from "@flamework/core/out/utility";
import { RunService } from "@rbxts/services";

type GeneratorIdReturning<T extends boolean> = T extends true ? string : number;

interface ConstructorWithIndex extends Constructor {
	__index: object;
}

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

export const IsServer = RunService.IsServer();
export const IsClient = RunService.IsClient();

export function logError(Message?: string, DisplayTraceback = true): never {
	return error(`\n ${errorString} \n ${Message ?? ""} \n \n ${DisplayTraceback && debug.traceback()}`);
}

export function logWarning(Message: string) {
	warn(`\n ${warnString} \n ${Message} \n`);
}

export function logAssert<T>(condition: T, message?: string, DisplayTraceback = true): asserts condition {
	!condition && logError(message, DisplayTraceback);
}

export function GetConstructorIdentifier(constructor: Constructor) {
	return (Reflect.getMetadata(constructor, "identifier") as string) ?? "Not found id";
}

export function GetParentConstructor(ctor: AbstractConstructor) {
	const metatable = getmetatable(ctor) as { __index?: object };
	if (metatable && typeIs(metatable, "table")) {
		const parentConstructor = rawget(metatable, "__index") as AbstractConstructor;
		return parentConstructor;
	}
}

export const ForeachDeepTable = (
	tbl: object,
	callback: (value: unknown, key: unknown) => void,
	predicate?: (value: object) => boolean,
) => {
	for (const [key, value] of pairs(tbl)) {
		if (typeIs(value, "table")) {
			if (predicate && predicate(value)) {
				callback(key, value);
				continue;
			}
			ForeachDeepTable(value, callback);
			continue;
		}
		callback(key, value);
	}
};

export function GetInheritanceTree<T>(constructor: Constructor, parent: Constructor) {
	let currentClass = constructor as ConstructorWithIndex;
	let metatable = getmetatable(currentClass) as ConstructorWithIndex;
	const tree = [constructor] as Constructor<T>[];

	while (currentClass && rawget(metatable, "__index") !== parent) {
		currentClass = rawget(metatable, "__index") as ConstructorWithIndex;
		metatable = getmetatable(currentClass) as ConstructorWithIndex;
		tree.push(currentClass as unknown as Constructor<T>);
	}

	return tree;
}
