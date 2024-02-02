import { RootState } from "../rootProducer";

export function SelectSharedComponent(id: string) {
	return function (State: RootState) {
		return State.replication.ComponentStates.get(id);
	};
}
