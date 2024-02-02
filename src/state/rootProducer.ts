import { InferState, combineProducers } from "@rbxts/reflex";
import { Slices } from "./slices";

export type RootState = InferState<typeof rootProducer>;
export type RootActions = InferState<typeof rootProducer>;

export const rootProducer = combineProducers({
	...Slices,
});
