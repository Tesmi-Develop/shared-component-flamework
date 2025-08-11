import { Modding } from "@flamework/core";

import { SharedRemoteEventServerToClient, SharedRemoteEventClientToServer } from "./event";
import { SharedComponent } from "../shared-component";
import { t } from "@rbxts/t";
import { ISharedRemoteAction, SharedRemoteAction } from "./action";
import { logAssert } from "../../utilities";

export interface ServerToClient {
	readonly __brand: unique symbol;
}

export interface ClientToServer {
	readonly __brand: unique symbol;
}

/** @hidden */
export interface ISharedNetwork {
	/** @hidden */
	componentReferense: SharedComponent;

	/** @hidden */
	Identifier: string;

	/** @hidden */
	name: string;

	/** @hidden */
	Destroy(): void;

	/**
	 * @hidden
	 * @internal
	 */
	GetGuard(): t.check<unknown>;
}

export namespace SharedComponentNetwork {
	/** @metadata macro */
	export const event = <Mode extends ServerToClient | ClientToServer, A extends unknown[]>(
		mode?: Modding.Generic<Mode, "text">,
		validator?: Modding.Generic<A, "guard">,
	) => {
		type R = Mode extends ServerToClient ? SharedRemoteEventServerToClient<A> : SharedRemoteEventClientToServer<A>;
		logAssert(validator, "Guard must be provided");
		logAssert(mode, "Mode must be provided");

		return (
			mode === "ServerToClient"
				? new SharedRemoteEventServerToClient(validator)
				: new SharedRemoteEventClientToServer(validator)
		) as R;
	};

	/** @metadata macro */
	export const action = <A extends unknown[], R>(validator?: Modding.Generic<A, "guard">) => {
		logAssert(validator, "Guard must be provided");

		return new SharedRemoteAction<A, R>(validator) as ISharedRemoteAction<A, R>;
	};
}
