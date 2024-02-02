import { BaseComponent, Component } from "@flamework/components";
import { SharedComponentHandler, onSetupSharedComponent } from "./shared-component-handler";
import { Reflect } from "@flamework/core";
import { WrapSubscriber, Subscriber } from "../types";
import { RootState, rootProducer } from "../state/rootProducer";
import Maid from "@rbxts/maid";
import { RunService } from "@rbxts/services";
import { CreateGeneratorId } from "../utilities";
import { remotes } from "../remotes";
import { Selector } from "@rbxts/reflex";

function CallMethod<T extends Callback>(func: T, context: InferThis<T>, ...parameters: Parameters<T>): ReturnType<T> {
	return func(context, ...(parameters as unknown[]));
}

enum Prefix {
	Server = "Server",
	Client = "Client",
}

@Component()
export abstract class SharedComponent<S extends object, A extends object = {}, I extends Instance = Instance>
	extends BaseComponent<A, I>
	implements onSetupSharedComponent
{
	private static generatorId = CreateGeneratorId(true);
	protected abstract state: S;
	protected previusState!: S;
	private maid = new Maid();
	private id!: string;
	private prefix?: string;
	private metadataId!: string;

	constructor(private sharedComponentHandler: SharedComponentHandler) {
		super();
	}

	/**
	 * @deprecated
	 * @hidden
	 */
	onSetup() {
		const id = this.sharedComponentHandler.GetSharedComponentMetadataId(this);
		assert(id, "Shared component metadata id not found");
		this.metadataId = id;

		this.applyId();
		this.initSubscribers();
		this.subcribeState();
	}

	public destroy(): void {
		super.destroy();
		this.maid.Destroy();
	}

	/**
	 * Get the full ID of the object.
	 *
	 * @return {string} the full ID
	 */
	public GetFullId(): string {
		return `${this.prefix ?? ""}-${this.metadataId ?? "-1"}-${this.id ?? "0"}`;
	}

	/**
	 * Subscribe to changes in the state and attach a listener.
	 *
	 * @param {Selector<S, R>} selector - the selector function
	 * @param {(state: R, previousState: R) => void} listener - the listener function
	 * @param {(state: R) => boolean} [predicate] - optional predicate function
	 * @return {WrapSubscriber} subscriber object
	 */
	public Subscribe<R>(
		selector: Selector<S, R>,
		listener: (state: R, previousState: R) => void,
		predicate?: (state: R) => boolean,
	): WrapSubscriber {
		const disconnect = rootProducer.subscribe(this.wrapSelector(selector), predicate, listener);
		const subscriber = {
			Disconnect: disconnect,

			OnlyServer: () => {
				if (!RunService.IsServer()) return disconnect;
				disconnect();

				return disconnect;
			},

			OnlyClient: () => {
				if (!RunService.IsClient()) return disconnect;
				disconnect();

				return disconnect;
			},
		};

		return subscriber;
	}

	private changeId(prefix: Prefix, id: string) {
		this.id && rootProducer.ClearInstance(this.id);

		this.id = id;
		this.prefix = prefix;
		rootProducer.Dispatch(this.GetFullId(), this.state);
		rootProducer.flush();
	}

	private applyId() {
		if (RunService.IsServer()) {
			const id = SharedComponent.generatorId.Next();
			this.changeId(Prefix.Server, id);
			this.sharedComponentHandler.AddNewInstance(this.instance, this.metadataId, id);
			return;
		}

		const disconnect = remotes._reciveInstanceId.connect((instance, id, metadata) => {
			if (instance === this.instance && metadata === this.metadataId) {
				this.changeId(Prefix.Server, id);
				disconnect();
			}
		});

		const id = SharedComponent.generatorId.Next();
		this.changeId(Prefix.Client, id);
		remotes._getInstanceId.fire(this.instance, this.metadataId);
	}

	private subcribeState() {
		this.previusState = this.state;

		this.maid.GiveTask(
			rootProducer.subscribe(
				(state) => state.replication.ComponentStates.get(this.GetFullId()),
				(state, previousState) => {
					this.state = state as S;
					this.previusState = previousState as S;
				},
			),
		);
	}

	private wrapSelector<R>(selector: Selector<S, R>) {
		return (state: RootState) => {
			const componentState = state.replication.ComponentStates.get(this.GetFullId());
			if (!componentState) {
				return selector(this.state);
			}
			return selector(componentState as S);
		};
	}

	private initSubscribers() {
		const subscribes = Reflect.getMetadata(this, "Subscribes") as Subscriber[];
		if (!subscribes) return;

		subscribes.forEach((subscriber) => {
			this.maid.GiveTask(
				rootProducer.subscribe(this.wrapSelector(subscriber.selector), (state, previousState) =>
					CallMethod(subscriber.callback, this, state as S, previousState as S),
				),
			);
		});
	}
}
