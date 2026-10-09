import re
from typing import List, Dict, Any

class RAGEngine:
    """
    Retrieval-Augmented Generation (RAG) knowledge engine
    Grounded in Egyptian pharmaceutical formulary and Firebird ERP entity schema.
    """
    def __init__(self):
        # Seed drug knowledge base with common Egyptian medication active ingredients
        self._knowledge_base = [
            {
                "trade_name": "Augmentin 1g",
                "active_ingredient": "Amoxicillin + Clavulanic Acid",
                "alternatives": ["Curam 1g", "Megamox 1g", "Hibiotic 1g", "Clavimox 1g"],
                "category": "Antibiotic",
            },
            {
                "trade_name": "Panadol Extra",
                "active_ingredient": "Paracetamol 500mg + Caffeine 65mg",
                "alternatives": ["Cetamol Extra", "Abimol Extra", "Adol Extra", "Paramol Extra"],
                "category": "Analgesic",
            },
            {
                "trade_name": "Concor 5mg",
                "active_ingredient": "Bisoprolol Fumarate 5mg",
                "alternatives": ["Bisor 5mg", "Lodoz 5mg", "Biso-Card 5mg"],
                "category": "Cardiovascular",
            },
            {
                "trade_name": "Cataflam 50mg",
                "active_ingredient": "Diclofenac Potassium 50mg",
                "alternatives": ["Dolphin K 50mg", "Declophen 50mg", "Voltaren Acti-Sub 50mg"],
                "category": "NSAID",
            },
            {
                "trade_name": "Controloc 40mg",
                "active_ingredient": "Pantoprazole 40mg",
                "alternatives": ["Pantozol 40mg", "Zurcal 40mg", "Antopral 40mg"],
                "category": "PPI / Gastrointestinal",
            },
        ]

    def search_alternatives(self, query: str) -> List[Dict[str, Any]]:
        clean_q = query.lower().strip()
        matches = []
        for entry in self._knowledge_base:
            if entry["trade_name"].lower() in clean_q or any(alt.lower() in clean_q for alt in entry["alternatives"]):
                matches.append(entry)
            elif entry["active_ingredient"].lower() in clean_q:
                matches.append(entry)
        return matches

    def build_grounded_prompt(self, user_query: str, erp_context: Dict[str, Any]) -> str:
        matches = self.search_alternatives(user_query)
        rag_context_str = ""
        if matches:
            rag_context_str = "\n".join([
                f"- الدواء: {m['trade_name']} | المادة الفعالة: {m['active_ingredient']} | البدائل المتاحة تجارياً في مصر: {', '.join(m['alternatives'])}"
                for m in matches
            ])

        return f"""أنت المستشار الذكي والمساعد الصيدلي المتقدم لمنصة XPharma.
مهمتك: مساعدة الصيدلي بدقة في الاستفسار عن بدائل الأدوية، تواريخ الصلاحية، وفواتير المشتريات.

[سياق قاعدة المعرفة الصيدلانية]:
{rag_context_str or 'لا توجد بدائل مطابقة مسبقاً، اعتمد على المعرفة السريرية الدقيقة.'}

[سياق المستودع والطلب]:
{erp_context}

[استفسار الصيدلي]:
{user_query}

يرجى الرد باللغة العربية باحترافية، وذكر المادة الفعالة والبدائل المماثلة (نفس المادة ونفس التركيز) والبدائل المكافئة علاجياً.
"""

rag_engine = RAGEngine()
