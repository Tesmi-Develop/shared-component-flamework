import { produce } from "@rbxts/immut";
import { createProducer } from "@rbxts/reflex";

type State = {
	ComponentStates: ReadonlyMap<string, defined>;
};

const initialState: State = {
	ComponentStates: new Map(),
};

export const DISPATCH = "Dispatch";

export const replicationSlice = createProducer(initialState, {
	[DISPATCH]: (state, key: string, newState: defined) => {
		return produce(state, (draft) => {
			draft.ComponentStates.set(key, newState);
		});
	},

	ClearState: (state, key: string) => {
		return produce(state, (draft) => {
			draft.ComponentStates.delete(key);
		});
	},
});
