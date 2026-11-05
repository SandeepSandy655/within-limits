import { useEffect, useRef } from "react";
import Brand from "./Brand";

export default function Sidebar({ views, active, user, onChoose, onClose, onSignOut }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const icons = { dashboard: "⌂", routes: "◇", "tracked-groups": "◎", history: "◷" };
  return <dialog className="admin-drawer" ref={dialog} aria-label="Dashboard menu" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current && event.clientX > dialog.current.getBoundingClientRect().right) onClose(); }}>
    <div className="drawer-heading"><Brand/><button className="icon-button" onClick={onClose} aria-label="Close dashboard menu">×</button></div>
    <div className="drawer-intro"><h2>Go together.</h2><p>Your groups. Every step.</p></div>
    <div className="drawer-profile"><span className="group-avatar">{(user.displayName || "Admin").slice(0,1)}</span><div><strong>{user.displayName || "Administrator"}</strong><small>Within Limits workspace</small></div></div>
    <p className="eyebrow">WORKSPACE</p>
    <nav aria-label="Workspace navigation">{views.map(view => <a key={view.id} href={`#${view.id}`} aria-current={active === view.id ? "page" : undefined} onClick={event => { event.preventDefault(); onChoose(view.id); }}><span aria-hidden="true">{icons[view.id]}</span>{view.label}<span className="row-arrow" aria-hidden="true">›</span></a>)}</nav>
    <div className="drawer-footer"><p>Route completion keeps your records safe in History.</p><button className="quiet-button" onClick={onSignOut}>Sign out</button></div>
  </dialog>;
}
