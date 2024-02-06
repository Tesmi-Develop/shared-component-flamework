import { Constructor, IntrinsicSymbolId } from "@flamework/core/out/utility";
import { IsClient, IsServer, logAssert } from "../../utilities";
import { SharedComponent } from "../shared-component";
import { Modding } from "@flamework/core";

type DecoratorWithMetadata<T, P> = T & { _flamework_Parameters: P };
type AnyDecorator = DecoratorWithMetadata<(...args: never[]) => unknown, unknown[]>;
type IdRef<T> = string | IntrinsicSymbolId<T>;

export type DecoratorCallbackImplementation = (
	constructor: Constructor<SharedComponent<object>>,
	properties: ReturnType<typeof Modding.getPropertyDecorators>,
	sharedConstructor: Constructor<SharedComponent<object>>,
) => void;

type DecoratorImplementation = {
	callback: DecoratorCallbackImplementation;
};

export const DecoratorImplementations = new Map<IdRef<AnyDecorator>, DecoratorImplementation>();

/**
 * @metadata macro
 */
export const registeryDecoratorImplementation = <T extends AnyDecorator>(
	serverImplementation?: DecoratorCallbackImplementation,
	clientImplementation?: DecoratorCallbackImplementation,
	id?: IdRef<T>,
) => {
	logAssert(id);
	if (DecoratorImplementations.has(id)) return;

	DecoratorImplementations.set(id, {
		callback: (...args: Parameters<DecoratorCallbackImplementation>) => {
			IsServer && (serverImplementation ?? (() => {}))(...args);
			IsClient && (clientImplementation ?? (() => {}))(...args);
		},
	});
};
