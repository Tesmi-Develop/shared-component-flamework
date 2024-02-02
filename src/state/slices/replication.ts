import { produce } from "@rbxts/immut";
import { createProducer } from "@rbxts/reflex";

type State = {
	ComponentStates: ReadonlyMap<string, defined>;
	ComponetMetadatas: ReadonlyMap<string, string>;
};

const initialState: State = {
	ComponentStates: new Map(),
	ComponetMetadatas: new Map(),
};

export const replicationSlice = createProducer(initialState, {
	Dispatch: (state, key: string, newState: defined) => {
		return produce(state, (draft) => {
			draft.ComponentStates.set(key, newState);
		});
	},

	SetComponentMetadatas: (state, components: Map<string, string>) => {
		return produce(state, (draft) => {
			draft.ComponetMetadatas = components;
		});
	},

	ClearInstance: (state, key: string) => {
		return produce(state, (draft) => {
			draft.ComponentStates.delete(key);
		});
	},
});
