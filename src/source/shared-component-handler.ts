import { Controller, Modding, OnInit, Service } from "@flamework/core";
import { BroadcastAction, ProducerMiddleware } from "@rbxts/reflex";
import { ReplicatedStorage, RunService } from "@rbxts/services";
import { remotes } from "../remotes";
import { rootProducer } from "../state/rootProducer";
import { SharedComponent } from "./shared-component";
import { Constructor } from "@flamework/core/out/utility";
import { IsClient, IsServer, logWarning } from "../utilities";
import { SharedComponentInfo } from "../types";
import { Components } from "@flamework/components";
import { Pointer } from "./pointer";

const event = ReplicatedStorage.FindFirstChild("REFLEX_DEVTOOLS") as RemoteEvent;

interface ConstructorWithIndex extends Constructor {
	__index: object;
}

const devToolMiddleware: ProducerMiddleware = () => {
	return (nextAction, actionName) => {
		return (...args) => {
			const state = nextAction(...args);
			if (RunService.IsStudio() && event) {
				event.FireServer({ name: actionName, args: [...args], state });
			}

			return state;
		};
	};
};

export interface onSetupSharedComponent {
	onSetup(): void;
}

@Service({
	loadOrder: 0,
})
@Controller({
	loadOrder: 0,
})
export class SharedComponentHandler implements OnInit {
	constructor(private components: Components) {}

	/**
	 * @hidden
	 * @internal
	 */
	public onInit() {
		Modding.onListenerAdded<onSetupSharedComponent>((val) => val.onSetup());
		IsServer && this.onServerSetup();
		IsClient && this.onClientSetup();
	}

	private invokeDispatch(component: SharedComponent, actions: BroadcastAction[]) {
		component.__DispatchFromServer(actions);
	}

	private resolveDispatch(
		actions: BroadcastAction[],
		{ Instance, Identifier, SharedIdentifier, PointerID }: SharedComponentInfo,
	) {
		if (!Modding.getObjectFromId(SharedIdentifier)) {
			logWarning(
				`Attempt to allow dispatching, but shared component does not exist\n SharedIdentifier: ${SharedIdentifier}`,
			);
			return;
		}

		// Try get component from pointer
		if (PointerID) {
			const pointer = Pointer.GetPointer(PointerID);

			if (!pointer) {
				logWarning(`Attempt to dispatch component with missing pointer\n PointerID: ${PointerID}`);
				return;
			}

			try {
				const component = this.components.getComponent<SharedComponent>(
					Instance,
					pointer.GetComponentMetadata(),
				);
				component && this.invokeDispatch(component, actions);
			} catch (error) {
				logWarning(`${error}\n PointerID: ${PointerID}`);
			}

			return;
		}

		// Try get component from indentifier
		if (Modding.getObjectFromId(Identifier)) {
			const component = this.components.getComponent<SharedComponent>(Instance, Identifier);
			component && this.invokeDispatch(component, actions);
		}

		// Try get component from shared identifier
		const sharedComponent = this.components.getComponents<SharedComponent>(Instance, SharedIdentifier);

		if (sharedComponent.size() > 1) {
			logWarning(
				`Attempt to allow dispatching when an instance has multiple sharedComponent\n Instance: ${Instance}\n SharedIdentifier: ${SharedIdentifier}\n ServerIdentifier: ${Identifier}`,
			);
			return;
		}

		this.invokeDispatch(sharedComponent[0], actions);
	}

	private onClientSetup() {
		remotes._shared_component_dispatch.connect((actions, componentInfo) => {
			this.resolveDispatch(actions, componentInfo);
		});
	}

	private onServerSetup() {}

	public AttachReflexDevTools() {
		rootProducer.applyMiddleware(devToolMiddleware);
	}

	private getSharedComponent(constructor: Constructor) {
		let currentClass = constructor as ConstructorWithIndex;
		let metatable = getmetatable(currentClass) as ConstructorWithIndex;

		while (currentClass && metatable.__index !== SharedComponent) {
			currentClass = metatable.__index as ConstructorWithIndex;
			metatable = getmetatable(currentClass) as ConstructorWithIndex;
		}

		return currentClass as Constructor<SharedComponent<object>>;
	}

	private getInheritanceTree<T>(constructor: Constructor) {
		let currentClass = constructor as ConstructorWithIndex;
		let metatable = getmetatable(currentClass) as ConstructorWithIndex;
		const tree = [constructor] as Constructor<T>[];

		while (currentClass && metatable.__index !== SharedComponent) {
			currentClass = metatable.__index as ConstructorWithIndex;
			metatable = getmetatable(currentClass) as ConstructorWithIndex;
			tree.push(currentClass as unknown as Constructor<T>);
		}

		return tree;
	}
}
