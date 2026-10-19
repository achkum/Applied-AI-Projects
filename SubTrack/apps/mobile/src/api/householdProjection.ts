import type {SandboxHouseholdView} from '@subtrack/contracts/sandbox-household';
import type {PrivateOwnerSubscriptionView} from '../../../../packages/contracts/generated/types.gen';
import {add,allocateEvenly,money,type Money} from '../../../../packages/money/src/money';
import {recurringCost} from '../../../../packages/money/src/recurring-cost';

/** Usage is an owner-entered attribution, never access to another person's bank data. */
export function projectHouseholdUsage(view:SandboxHouseholdView,subscriptions:readonly PrivateOwnerSubscriptionView[]){
 if(!view.household)return null;
 const household=view.household,admin=household.members.find(member=>member.role==='ADMIN')!;
 const members=household.members.map(member=>({...member,monthly:money(0n,'SEK'),payerMonthly:money(0n,'SEK'),subscriptionCount:0}));
 let monthly=money(0n,'SEK'),unknownPayerMonthly=money(0n,'SEK');
 const plans: {subscription:PrivateOwnerSubscriptionView;monthly:Money;memberIds:readonly string[];payerMemberId:string|null;allocations:readonly Money[]}[]=[];
 for(const subscription of subscriptions){
  if(subscription.status!=='ACTIVE'||subscription.currency!=='SEK')continue;
  const cost=recurringCost(money(BigInt(subscription.expectedAmountMinor),subscription.currency),subscription.cadence);if(!cost)continue;
  const configured=household.assignments.find(assignment=>assignment.subscriptionId===subscription.id);
  const memberIds=configured?.memberIds.length?configured.memberIds:[admin.id],payerMemberId=configured?.payerMemberId??null;
  const allocations=allocateEvenly(cost.monthly,memberIds.length);
  monthly=add(monthly,cost.monthly);
  for(let index=0;index<memberIds.length;index++){
   const target=members.find(member=>member.id===memberIds[index]);if(!target)throw new Error('Household attribution unavailable');
   target.monthly=add(target.monthly,allocations[index]!);target.subscriptionCount++;
  }
  if(payerMemberId!==null){const payer=members.find(member=>member.id===payerMemberId);if(!payer)throw new Error('Household payer unavailable');payer.payerMonthly=add(payer.payerMonthly,cost.monthly);}else unknownPayerMonthly=add(unknownPayerMonthly,cost.monthly);
  plans.push({subscription,monthly:cost.monthly,memberIds,payerMemberId,allocations});
 }
 return {household,members,plans,monthly,unknownPayerMonthly,adminId:admin.id};
}
