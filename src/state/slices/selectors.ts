import { RootState } from "../rootProducer";

export function SelectSharedComponent(id: string) {
	return function (state: RootState) {
		return state.replication.ComponentStates.get(id);
	};
}
