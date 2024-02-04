import { SharedComponent } from "../shared-component";
import { rootProducer } from "../../state/rootProducer";

/**
 * Decorator for creating an Action inside a shared component.
 */
export const Action = () => {
	return <S extends object, T extends SharedComponent<S>>(
		_target: T,
		_propertyKey: string,
		descriptor: TypedPropertyDescriptor<(this: T, ...args: unknown[]) => S>,
	) => {
		const originalMethod = descriptor.value;

		descriptor.value = function (this: T, ...args: unknown[]) {
			const result = originalMethod(this, ...args);
			rootProducer.Dispatch(this.GetFullId(), result);

			return result;
		};

		return descriptor;
	};
};
