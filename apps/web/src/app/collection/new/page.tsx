import { NewCardForm } from "@/components/new-card-form";
import { isDemoMode } from "@/lib/repository";
export default function NewCardPage(){return <div className="page"><div className="page-head"><div><h1 className="page-title">Add physical card</h1><p className="page-sub">Create the copy first, then upload its front/back photos and videos.</p></div></div><div style={{maxWidth:760}}><NewCardForm disabled={isDemoMode()}/></div></div>}
