import { RunService } from "@rbxts/services";
import { remotes } from "../remotes";
import { SharedComponent } from "./shared-component";
import { Modding } from "@flamework/core";
import { t } from "@rbxts/t";

const ACTION_GUARD_FAILED = "__ACTION_GUARD_FAILED";

export interface ISharedAction<A extends unknown[], R> {
	/** @hidden @deprecated */
	componentReferense: SharedComponent;

	/** @hidden @deprecated */
	actionName: string;

	(...args: A): Promise<R>;

	Invoke(...args: A): Promise<R>;

	OnRequest(callback: (player: Player, ...args: A) => R): void;

	/** @hidden */
	GetServerCallback(): (player: Player, ...args: A) => R;
}

export class SharedAction {
	private serverCallback?: (player: Player) => unknown;

	/** @hidden */
	public componentReferense!: SharedComponent;

	/** @hidden */
	public actionName!: string;

	private guard?: t.check<unknown>;

	/** @metadata macro */
	public static Create<A extends unknown[], R>(
		serverCallback?: (player: Player) => R,
		guard?: Modding.Generic<A, "guard">,
	) {
		assert(guard, "Guard must be provided");
		const action = new SharedAction(serverCallback, guard);
		const mt = getmetatable(action) as { __call: (context: SharedAction, ...args: A) => Promise<R> };

		mt.__call = (context: SharedAction, ...args: A) => {
			return context.Invoke(...args) as Promise<R>;
		};

		return action as unknown as ISharedAction<A, R>;
	}

	constructor(serverCallback?: (player: Player) => unknown, guard?: t.check<unknown>) {
		this.serverCallback = serverCallback;
		this.guard = guard;
	}

	public OnRequest(callback: (player: Player, ...args: unknown[]) => unknown) {
		this.serverCallback = (player, ...args: unknown[]) => {
			if (this.guard && !this.guard(args)) {
				return ACTION_GUARD_FAILED;
			}
			callback(player, ...args);
		};
	}

	/** @hidden */
	public GetServerCallback() {
		return this.serverCallback;
	}

	public async Invoke(...args: unknown[]) {
		assert(RunService.IsClient(), "Action can't be invoked on client");
		assert(this.componentReferense, "Component must be attached");

		const result = await remotes._shared_component_action(
			this.componentReferense.GenerateInfo(),
			this.actionName,
			args,
		);

		assert(result !== ACTION_GUARD_FAILED, "Guard failed");

		return result;
	}
}
