import { t } from "@rbxts/t";
import { ISharedNetwork } from ".";
import { SharedComponent } from "../shared-component";
import { IsClient } from "../../utilities";
import { remotes } from "../../remotes";

/** @internal */
export const ACTION_GUARD_FAILED = "__ACTION_GUARD_FAILED";

export interface ISharedRemoteAction<A extends unknown[], R> extends SharedRemoteAction<A, R> {
	/**
	 * Sends a request for the server to process. Returns a Promise that resolves
	 * with the return value of the server handler.
	 *
	 * Arguments are validated on the server before they are processed.
	 *
	 * @client
	 */
	(...args: A): R;
}

export class SharedRemoteAction<A extends unknown[], R> implements ISharedNetwork {
	public static readonly RemoteFunctionIndefinitely = "__SHARED_COMPONENT_REMOTE_FUNCTION";

	public componentReferense!: SharedComponent<{}, {}, Instance>;
	public name!: string;

	private guard: t.check<unknown>;
	private callback?: (player: Player, ...args: A) => void;

	constructor(guard: t.check<unknown>) {
		this.guard = guard;

		const mt = getmetatable(this) as {
			__call: (context: SharedRemoteAction<A, unknown>, ...args: A) => Promise<R>;
		};

		mt.__call = (context: SharedRemoteAction<A, unknown>, ...args: A) => {
			return context.Invoke(...args) as Promise<R>;
		};
	}

	public static Indefinitely(obj: ISharedNetwork): obj is ISharedRemoteAction<[], unknown> {
		return obj.Identifier === SharedRemoteAction.RemoteFunctionIndefinitely;
	}

	public readonly Identifier = SharedRemoteAction.RemoteFunctionIndefinitely;

	public Destroy() {}

	/** @internal */
	public GetCallback() {
		return this.callback;
	}

	/**
	 * Binds a server-side handler to the remote. When a player makes a request,
	 * the handler will be invoked with the arguments passed, and the return
	 * value will be sent back to the player.
	 *
	 * Arguments passed to the remote must first pass the validators defined
	 * in the schema before they are passed to the handler. Otherwise, the
	 * request will be rejected.
	 *
	 * @server
	 */
	public OnRequest(callback: (player: Player, ...args: A) => R) {
		this.callback = callback;
	}

	/**
	 * Sends a request for the server to process. Returns a Promise that resolves
	 * with the return value of the server handler.
	 *
	 * Arguments are validated on the server before they are processed.
	 *
	 * @client
	 */
	public async Invoke(...args: A) {
		assert(IsClient, "Function can't be invoked on server");
		const result = await remotes._shared_component_remote_function_Server(
			this.componentReferense.GenerateInfo(),
			this.name,
			args,
		);

		assert(result !== ACTION_GUARD_FAILED, "Guard failed");

		return result as R;
	}

	public GetGuard() {
		return this.guard;
	}
}
