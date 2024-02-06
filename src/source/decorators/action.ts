import { SharedComponent } from "../shared-component";

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
			this.Dispatch(result);

			return result;
		};

		return descriptor;
	};
};
