import { RootState } from "../rootProducer";

export function SelectSharedComponent(id: string) {
	return function (state: RootState) {
		return state.replication.ComponentStates.get(id);
	};
}

export function SelectSharedComponentMetadata(id: string) {
	return function (state: RootState) {
		return state.replication.ComponetMetadatas.get(id);
	};
}

export function SelectListSharedComponentMetadata(state: RootState) {
	return state.replication.ComponetMetadatas;
}
