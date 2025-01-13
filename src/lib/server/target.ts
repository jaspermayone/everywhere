import { Activity } from '@fedify/fedify';

export default interface Target {
	authenticate(): Promise<void>;
	authStatus: boolean;
	send(activity: Activity): Promise<void>;
	ensureAuthenticated(req: Request, res: Response, next: VoidFunction): void;
}
