import { Modding } from "@flamework/core";
import { registeryDecoratorImplementation } from "../functions/registery-decorator-implementation";
import { Constructor } from "@flamework/core/out/utility";
import { remotes } from "../../remotes";
import { logWarning } from "../../utilities";

type Method<T> = (this: T, ...parameters: unknown[]) => unknown;

const ModifyMethodConstructor = <T>(
	constructor: Constructor<T>,
	methodName: string,
	visitor: (originalMethod: Method<T>) => Method<T>,
): Constructor<T> => {
	const modifiedMethod = visitor(constructor[methodName as never]);
	constructor[methodName as never] = modifiedMethod as never;
	return constructor;
};

/**
 * @metadata flamework:parameter_guards
 */
export const ServerMethod = Modding.createDecorator("Method", (descriptor, config) => {
	registeryDecoratorImplementation<typeof ServerMethod>(
		() => {},
		(constructor, props, sharedComponent) => {
			props.forEach((value, propName) => {
				ModifyMethodConstructor(
					constructor,
					propName,
					(originalMethod) =>
						function (this, ...args) {
							const [success, returning] = remotes
								._shared_component_requestMethod(this.GetFullId(), propName, args)
								.await();
							!success && logWarning(`Failed to call method \n ${returning}`);

							return returning;
						},
				);
			});
		},
	);
});
