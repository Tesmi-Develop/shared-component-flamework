import { Controller, Modding, OnInit, Reflect, Service } from "@flamework/core";
import {
	BroadcastReceiver,
	Broadcaster,
	ProducerMiddleware,
	createBroadcastReceiver,
	createBroadcaster,
} from "@rbxts/reflex";
import { ReplicatedStorage, RunService } from "@rbxts/services";
import { Slices } from "../state/slices";
import { remotes } from "../remotes";
import { rootProducer } from "../state/rootProducer";
import { OnlyServer } from "./decorators/only-server";
import { CreateGeneratorId, logAssert, logWarning } from "../utilities";
import { Component } from "@flamework/components";
import { SharedComponent } from "./shared-component";
import { Constructor } from "@flamework/core/out/utility";
import { SelectListSharedComponentMetadata, SelectSharedComponentMetadata } from "../state/slices/selectors";

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

type Metadata = string;

@Service({
	loadOrder: 0,
})
@Controller({
	loadOrder: 0,
})
export class SharedComponentHandler implements OnInit {
	private receiver!: BroadcastReceiver<typeof Slices>;
	private broadcaster!: Broadcaster;
	private instances = new Map<Metadata, Map<Instance, string>>();
	private sharedComponents = new Map<Constructor, Map<Instance, object>>();
	private idGenerator = CreateGeneratorId(true);

	/**
	 * @deprecated
	 * @hidden
	 */
	public onInit() {
		this.registerySharedComponents();
		RunService.IsServer() && this.serverSetup();
		RunService.IsClient() && this.clientSetup();
	}

	public AttachReflexDevTools() {
		rootProducer.applyMiddleware(devToolMiddleware);
	}

	private clientSetup() {
		this.receiver = createBroadcastReceiver({
			start: () => {
				remotes._start.fire();
			},
		});

		remotes._dispatch.connect((actions) => {
			this.receiver.dispatch(actions);
		});

		remotes._reciveInstanceId.connect((instance, metadata, id) => {
			this.addNewInstance(instance, metadata, id);
		});

		rootProducer.applyMiddleware(this.receiver.middleware);
	}

	private serverSetup() {
		this.broadcaster = createBroadcaster({
			producers: Slices,

			dispatch: (player, actions) => {
				remotes._dispatch.fire(player, actions);
			},
		});

		rootProducer.applyMiddleware(this.broadcaster.middleware);
		remotes._start.connect((player) => this.broadcaster.start(player));

		remotes._getInstanceId.onRequest((player, instance, metadata) => {
			return this.instances.get(metadata)?.get(instance);
		});
	}

	public async GetInstanceById(instance: Instance, metadata: Metadata) {
		if (RunService.IsServer()) {
			return this.instances.get(metadata)?.get(instance);
		}

		if (this.instances.get(metadata)?.has(instance)) {
			return this.instances.get(metadata)?.get(instance);
		}

		const result = await remotes._getInstanceId(instance, metadata);
		result && this.addNewInstance(instance, metadata, result);
		return result;
	}

	private addNewInstance(instance: Instance, metadata: Metadata, id: string) {
		let instances = this.instances.get(metadata);

		if (!instances) {
			instances = new Map();
			this.instances.set(metadata, instances);
		}

		instances.set(instance, id);
	}

	/**
	 * @server
	 */
	@OnlyServer
	public AddNewInstance(instance: Instance, metadata: Metadata, id: string) {
		this.addNewInstance(instance, metadata, id);
		remotes._reciveInstanceId.fireAll(instance, metadata, id);
	}

	public GetSharedComponentMetadataId(component: Constructor) {
		const identifier = Reflect.getMetadata(component as object, "identifier") as string;
		logAssert(identifier, "Failed to get identifier");

		return rootProducer.getState(SelectSharedComponentMetadata(identifier));
	}

	private instanceOfSharedComponent(obj: object) {
		const metatable = getmetatable(obj) as ConstructorWithIndex;
		return metatable.__index === SharedComponent;
	}

	/**
	 * @hidden
	 */
	public RegisteryDescendantSharedComponent(component: SharedComponent<object>) {
		const sharedClass = this.getSharedComponent(component);
		let instances = this.sharedComponents.get(sharedClass);
		logAssert(sharedClass, "Failed to get shared component");

		if (!instances) {
			instances = new Map();
			this.sharedComponents.set(sharedClass, instances);
		}

		if (instances.has(component.instance)) {
			logWarning(
				`${sharedClass} already has a descendant. The second descendant will have the state of the first descendant `,
			);
			return sharedClass;
		}

		instances.set(component.instance, component);

		return sharedClass;
	}

	private getSharedComponent(instance: object) {
		let currentClass = getmetatable(instance) as ConstructorWithIndex;
		let previousClass = currentClass;

		while (currentClass && currentClass.__index !== SharedComponent) {
			previousClass = currentClass;
			currentClass = getmetatable(currentClass.__index) as ConstructorWithIndex;
		}

		return previousClass.__index as Constructor;
	}

	private registerySharedComponents() {
		const listMetadata = rootProducer.getState(SelectListSharedComponentMetadata);
		if (RunService.IsClient() && listMetadata.size() > 0) {
			return;
		}

		const metadata = new Map<Metadata, string>();
		const components = Modding.getDecorators<typeof Component>();

		components.forEach((component) => {
			const componentConstructor = component.constructor;
			if (!componentConstructor) return;
			if (componentConstructor === (SharedComponent as unknown as Constructor)) return;
			if (!this.instanceOfSharedComponent(componentConstructor)) return;

			const identifier = Reflect.getMetadata(componentConstructor, "identifier") as string;
			if (identifier) metadata.set(identifier, this.idGenerator.Next());
		});

		rootProducer.SetComponentMetadatas(metadata);
	}
}
