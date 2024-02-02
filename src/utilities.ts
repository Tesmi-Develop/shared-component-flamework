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