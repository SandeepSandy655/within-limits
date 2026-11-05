import { useEffect, useRef } from "react";
import GroupProximity from "./GroupProximity.jsx";

export default function GroupDetails({ group, route, monitors, formatTime, onAssign, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className="group-dialog" id="group-details" aria-labelledby="group-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="group-dialog-heading"><div><h2 id="group-dialog-title">{group.name}</h2><p>{group.members.length} active · {group.finishedMembers || 0} finished · {group.leaderName}</p></div><button className="icon-button" aria-label="Close details" onClick={onClose} autoFocus>×</button></div>
    <div className="group-dialog-body">
      <GroupProximity key={group.id} group={group} route={route} monitors={monitors} formatTime={formatTime} onAssign={onAssign}/>
    </div>
    <div className="group-dialog-footer"><span>{group.finishedMembers || 0} of {group.totalMembers || group.members.length} members finished</span><span>Updates every 15 seconds</span></div>
  </dialog>;
}
