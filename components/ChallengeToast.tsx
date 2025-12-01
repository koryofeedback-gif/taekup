import React, { useEffect, useState } from 'react';

interface ChallengeToastProps {
    challenge: {
        from_student_name: string;
        challenge_name: string;
        challenge_xp: number;
    } | null;
    onClose: () => void;
    onViewInbox: () => void;
}

export const ChallengeToast: React.FC<ChallengeToastProps> = ({ challenge, onClose, onViewInbox }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        if (challenge) {
            setIsVisible(true);
            setIsLeaving(false);
            
            const timer = setTimeout(() => {
                handleClose();
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [challenge]);

    const handleClose = () => {
        setIsLeaving(true);
        setTimeout(() => {
            setIsVisible(false);
            onClose();
        }, 300);
    };

    if (!challenge || !isVisible) return null;

    return (
        <div 
            className={`fixed top-4 right-4 z-50 max-w-sm w-full transform transition-all duration-300 ${
                isLeaving ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
            }`}
        >
            <div className="bg-gradient-to-r from-red-900 to-orange-900 rounded-xl border-2 border-red-500 shadow-2xl overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                
                <div className="relative p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-2xl animate-pulse shrink-0">
                            ⚔️
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-red-300 font-bold uppercase tracking-wider mb-1">
                                New Challenge!
                            </p>
                            <p className="text-white font-bold truncate">
                                {challenge.from_student_name}
                            </p>
                            <p className="text-gray-300 text-sm">
                                challenges you to <span className="text-yellow-400 font-bold">{challenge.challenge_name}</span>
                            </p>
                            <p className="text-xs text-green-400 mt-1">
                                +{challenge.challenge_xp} XP if you win
                            </p>
                        </div>
                        <button 
                            onClick={handleClose}
                            className="text-gray-400 hover:text-white p-1"
                        >
                            ✕
                        </button>
                    </div>
                    
                    <div className="flex gap-2 mt-3">
                        <button 
                            onClick={() => {
                                onViewInbox();
                                handleClose();
                            }}
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                        >
                            View Challenge
                        </button>
                        <button 
                            onClick={handleClose}
                            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                        >
                            Later
                        </button>
                    </div>
                </div>

                <div className="h-1 bg-gray-800">
                    <div 
                        className="h-full bg-red-500 animate-shrink-width"
                        style={{ 
                            animation: 'shrinkWidth 5s linear forwards'
                        }}
                    ></div>
                </div>
            </div>

            <style>{`
                @keyframes shrinkWidth {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `}</style>
        </div>
    );
};

export default ChallengeToast;
